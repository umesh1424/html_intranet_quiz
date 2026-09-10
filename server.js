const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// CORS: allow the GitHub Pages frontend (and local dev) to call this API.
// The config endpoint only returns a public Supabase anon key, so a
// permissive origin is safe here.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-supabase-url, x-supabase-key, x-supabase-service-key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static frontend files for local testing (with clean URL support)
app.use(express.static(__dirname, { extensions: ['html', 'htm'] }));

// Dedicated Admin Supabase Client Helper (uses service role key only for matching project URL)
function getAdminSupabaseClient(req) {
  const reqUrl = (req && req.headers && req.headers['x-supabase-url']) ? String(req.headers['x-supabase-url']).trim().replace(/\/$/, '') : '';
  const envUrl = process.env.SUPABASE_URL ? String(process.env.SUPABASE_URL).trim().replace(/\/$/, '') : '';
  const reqServiceKey = req && req.headers && req.headers['x-supabase-service-key'];

  // If header provides a matching URL or no header URL was sent, use env service role key
  if (!reqUrl || reqUrl === envUrl) {
    const url = envUrl || reqUrl;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || reqServiceKey;
    if (url && serviceKey) {
      return createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    }
  } else if (reqUrl && reqServiceKey) {
    // If a different URL was sent with its own service key
    return createClient(reqUrl, reqServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  // If the browser sends a different Supabase URL without a dedicated service key, return null
  // so callers fall back to the user's authenticated client (req.supabaseClient)
  return null;
}

// Initialize Supabase Client Helper (uses process.env or request headers, and binds user JWT to PostgREST)
function getSupabaseClientForRequest(req, token) {
  const url = (req && req.headers && req.headers['x-supabase-url']) || process.env.SUPABASE_URL;
  const key = (req && req.headers && req.headers['x-supabase-key']) || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  };

  const bearerToken = token || (req && req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (bearerToken) {
    options.global = {
      headers: {
        Authorization: `Bearer ${bearerToken}`
      }
    };
  }

  const client = createClient(url, key, options);

  // Explicitly bind the user's Bearer token directly to PostgREST for all database queries
  if (bearerToken && client && client.postgrest && typeof client.postgrest.setHeader === 'function') {
    client.postgrest.setHeader('Authorization', `Bearer ${bearerToken}`);
  }

  return client;
}

const defaultSupabase = (process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY))
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  : null;

// ==========================================
// Auth Middleware (Route Guard)
// ==========================================
// Protects backend endpoints by validating the Supabase JWT sent in the Authorization header
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    const client = getSupabaseClientForRequest(req, token) || defaultSupabase;

    if (!client) {
      return res.status(500).json({ error: 'Supabase database client is not configured on server' });
    }
    
    // Validate JWT and retrieve user profile details from Supabase Auth
    const { data: { user }, error } = await client.auth.getUser(token);

    if (error || !user) {
      console.warn(`[Auth Guard] Token validation failed: ${error ? error.message : 'User not found'}`);
      return res.status(401).json({ error: 'Unauthorized: Invalid token session' });
    }

    // Attach user metadata, token, and authenticated client to request context
    req.user = user;
    req.token = token;
    req.supabaseClient = client;
    next();
  } catch (err) {
    console.error(`[Auth Guard Error] Unexpected verification error: ${err.message}`);
    return res.status(500).json({ error: 'Internal server validation error' });
  }
};

// ==========================================
// Webhook Handlers
// ==========================================
// Endpoint to receive auth.users events (INSERT/DELETE) from Supabase webhooks
app.post('/api/webhooks/user', async (req, res) => {
  // Verify webhook signature/secret to secure the endpoint
  const webhookSecret = req.headers['x-webhook-secret'];
  if (webhookSecret !== process.env.WEBHOOK_SECRET) {
    console.warn(`[Webhook Warning] Unauthorized webhook attempt received.`);
    return res.status(401).json({ error: 'Unauthorized: Webhook secret mismatch' });
  }

  const { type, record, old_record } = req.body;
  const client = getAdminSupabaseClient(req) || getSupabaseClientForRequest(req) || defaultSupabase;

  if (!client) {
    return res.status(500).json({ error: 'Supabase client not configured' });
  }

  try {
    if (type === 'INSERT') {
      const { id, email, raw_user_meta_data } = record;
      const displayName = raw_user_meta_data?.full_name || '';

      // Sync non-sensitive user metadata into the public profiles table
      const { error } = await client
        .from('profiles')
        .upsert({
          id: id,
          email: email,
          full_name: displayName,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
      console.log(`[Webhook Event] Synchronized user metadata for: ${email} (${id})`);
    } 
    
    else if (type === 'DELETE') {
      const { id } = old_record;

      // Delete non-sensitive metadata from profiles when user is deleted
      const { error } = await client
        .from('profiles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      console.log(`[Webhook Event] Deleted synced metadata profile for user ID: ${id}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`[Webhook Error] User synchronization failed: ${err.message}`);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Dynamic Config Fetch Endpoint
app.post('/api/config/get', (req, res) => {
  const { pin } = req.body || {};
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return res.status(500).json({
      success: false,
      error: 'Server environment error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are missing.'
    });
  }

  return res.status(200).json({
    success: true,
    name: 'Dynamic Intranet Quiz Config',
    config: {
      url,
      anonKey
    }
  });
});

// ==========================================
// Protected Teacher Routes
// ==========================================
app.get('/api/teacher/dashboard', requireAuth, async (req, res) => {
  try {
    // Only non-sensitive context is accessed
    const teacherId = req.user.id;
    const email = req.user.email;

    // Fetch quiz data for the authenticated teacher
    const { data: quizzes, error } = await req.supabaseClient
      .from('quizzes')
      .select('*')
      .eq('teacher_id', teacherId);

    if (error) throw error;

    return res.status(200).json({
      message: `Welcome back, ${email}`,
      quizzes
    });
  } catch (err) {
    console.error(`[API Error] Failed to fetch dashboard data: ${err.message}`);
    return res.status(500).json({ error: 'Failed to retrieve dashboard data' });
  }
});

// Protected Teacher Grading Endpoint
app.post('/api/teacher/grade-submission', requireAuth, async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { submissionId, score, responseSnapshot, studentResponses } = req.body;

    if (!submissionId) {
      return res.status(400).json({ error: 'Missing submissionId' });
    }

    if (score === undefined || score === null || isNaN(Number(score))) {
      return res.status(400).json({ error: 'Invalid score value' });
    }

    const targetScore = parseInt(score, 10);
    const adminClient = getAdminSupabaseClient(req) || req.supabaseClient || defaultSupabase;

    if (!adminClient) {
      return res.status(500).json({ error: 'Supabase database client is not configured on server' });
    }

    // 1. Fetch student_results row
    const { data: resultRow, error: fetchErr } = await adminClient
      .from('student_results')
      .select('*')
      .eq('id', submissionId)
      .maybeSingle();

    if (fetchErr) {
      return res.status(500).json({ error: `Database error retrieving submission: ${fetchErr.message}` });
    }

    if (!resultRow) {
      return res.status(404).json({ error: `Submission ID "${submissionId}" does not exist in the database.` });
    }

    // 2. Fetch associated quiz and verify ownership
    const { data: quizRow, error: quizErr } = await adminClient
      .from('quizzes')
      .select('*')
      .eq('id', resultRow.quiz_id)
      .maybeSingle();

    if (quizErr) {
      return res.status(500).json({ error: `Database error retrieving quiz: ${quizErr.message}` });
    }

    if (!quizRow) {
      return res.status(404).json({ error: `Associated quiz for submission "${submissionId}" was not found.` });
    }

    if (quizRow.teacher_id && quizRow.teacher_id !== teacherId) {
      return res.status(403).json({
        error: `Grading update was rejected: You do not own the quiz "${quizRow.title || resultRow.quiz_id}". It is owned by teacher (${quizRow.teacher_id}), while you are signed in as ${req.user.email || teacherId}.`
      });
    }

    // 3. Update student_responses if provided
    if (Array.isArray(studentResponses) && studentResponses.length > 0) {
      for (const resp of studentResponses) {
        if (resp.id) {
          await adminClient
            .from('student_responses')
            .update({
              marks_assigned: resp.marks_assigned,
              ai_reasoning: resp.ai_reasoning
            })
            .eq('id', resp.id);
        } else if (resultRow.quiz_id) {
          await adminClient
            .from('student_responses')
            .insert({
              quiz_id: resultRow.quiz_id,
              student_result_id: submissionId,
              student_name: resultRow.student_name,
              question_text: resp.question_text || '',
              question_bank_id: resp.question_bank_id || null,
              student_answer: resp.student_answer || '',
              question_type: resp.question_type || 'Manual',
              marks_assigned: resp.marks_assigned,
              ai_reasoning: resp.ai_reasoning
            });
        }
      }
    }

    // 4. Update student_results
    const updatePayload = { score: targetScore };
    if (responseSnapshot && Array.isArray(responseSnapshot)) {
      updatePayload.response_snapshot = responseSnapshot;
    }

    let { data: updatedRows, error: updateErr } = await adminClient
      .from('student_results')
      .update(updatePayload)
      .eq('id', submissionId)
      .select('id, quiz_id, score');

    if (updateErr && (updateErr.message?.includes('response_snapshot') || updateErr.message?.includes('column') || updateErr.code === 'PGRST204')) {
      const { data: retryRows, error: retryErr } = await adminClient
        .from('student_results')
        .update({ score: targetScore })
        .eq('id', submissionId)
        .select('id, quiz_id, score');
      updatedRows = retryRows;
      updateErr = retryErr;
    }

    if (updateErr) {
      return res.status(500).json({ error: `Database error updating student_results: ${updateErr.message}` });
    }

    // 5. Verify persistence
    const { data: verifiedRow } = await adminClient
      .from('student_results')
      .select('id, score')
      .eq('id', submissionId)
      .maybeSingle();

    if (!verifiedRow || Number(verifiedRow.score) !== targetScore) {
      return res.status(500).json({
        error: `Persistence verification failed for submission "${submissionId}". Database score did not update to ${targetScore}. Please ensure the student_results UPDATE RLS policy is applied in Supabase.`
      });
    }

    return res.status(200).json({
      success: true,
      submissionId,
      score: targetScore,
      row: verifiedRow
    });
  } catch (err) {
    console.error('[Grade Submission API Error]:', err);
    return res.status(500).json({ error: err.message || 'Internal server error during grading' });
  }
});

// Backend Storage Upload API (bypasses storage RLS policies using admin client)
app.post('/api/upload-attachment', async (req, res) => {
  try {
    const { fileName, fileDataUrl, quizId, studentName } = req.body;
    if (!fileName || !fileDataUrl) {
      return res.status(400).json({ error: 'Missing fileName or fileDataUrl' });
    }

    const adminClient = getAdminSupabaseClient(req);
    if (!adminClient) {
      return res.status(500).json({ error: 'Supabase admin client not available' });
    }

    const matches = String(fileDataUrl).match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid fileDataUrl format' });
    }

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const cleanName = String(fileName).replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueSuffix = Math.random().toString(36).substring(2, 7);
    const storagePath = `quiz_${quizId || 'general'}/${String(studentName || 'student').replace(/[^a-zA-Z0-9.-]/g, '_')}_${Date.now()}_${uniqueSuffix}_${cleanName}`;

    const { data: uploadResult, error: uploadErr } = await adminClient
      .storage
      .from('quiz-attachments')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadErr) {
      console.error('[Server Attachment Upload Error]:', uploadErr);
      return res.status(500).json({ error: uploadErr.message });
    }

    const { data: pubUrlObj } = adminClient
      .storage
      .from('quiz-attachments')
      .getPublicUrl(storagePath);

    return res.status(200).json({
      success: true,
      publicUrl: pubUrlObj?.publicUrl || ''
    });
  } catch (err) {
    console.error('[Server Upload Attachment Exception]:', err);
    return res.status(500).json({ error: err.message || 'Upload server error' });
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Process Error] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Supabase integrated auth server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please free the port or specify PORT in .env`);
  } else {
    console.error(`Server error:`, err);
  }
});

// Export the app for Vercel Serverless deployments
module.exports = app;

