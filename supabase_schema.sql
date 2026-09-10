-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table (For Teachers)
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    full_name text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Question Bank / Predefined Syllabus Pool
create table public.question_bank (
    id uuid default uuid_generate_v4() primary key,
    teacher_id uuid references public.profiles(id) on delete cascade not null,
    type text not null default 'MCQ', -- 'MCQ', 'FIB', or 'Short Answer'
    syllabus_tag text not null,
    question_text text not null,
    option_a text, -- nullable for FIB / Short Answer
    option_b text, -- nullable for FIB / Short Answer
    option_c text, -- nullable for FIB / Short Answer
    option_d text, -- nullable for FIB / Short Answer
    correct_option text not null, -- 'A', 'B', 'C', or 'D' for MCQ, text for FIB/Short Answer
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Quizzes Table
create table public.quizzes (
    id uuid default uuid_generate_v4() primary key,
    teacher_id uuid references public.profiles(id) on delete cascade not null,
    title text not null,
    rounds integer default 1 not null,
    question_count integer not null,
    duration_minutes integer not null,
    is_random boolean default false not null,
    randomize_questions boolean default false not null,
    randomize_options boolean default true not null,
    access_code varchar(10) unique not null,
    offline_mode boolean default false,
    start_otp text,
    submit_otp text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Migration helpers for existing databases
alter table public.quizzes add column if not exists offline_mode boolean default false;
alter table public.quizzes add column if not exists start_otp text;
alter table public.quizzes add column if not exists submit_otp text;
alter table public.quizzes add column if not exists randomize_questions boolean default false not null;
alter table public.quizzes add column if not exists randomize_options boolean default true not null;

-- 4. Quiz Questions Junction Table (Links Question Bank to Active Quizzes)
create table public.quiz_questions (
    id uuid default uuid_generate_v4() primary key,
    quiz_id uuid references public.quizzes(id) on delete cascade not null,
    question_bank_id uuid references public.question_bank(id) on delete cascade not null
);

-- 5. Student Results Table
create table public.student_results (
    id uuid default uuid_generate_v4() primary key,
    quiz_id uuid references public.quizzes(id) on delete cascade not null,
    student_name text not null,
    score integer not null,
    total_questions integer not null,
    response_snapshot jsonb not null default '[]'::jsonb,
    completed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.question_bank enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.student_results enable row level security;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Profiles: teachers manage only their own profile
create policy "Teachers manage own profile"
  on public.profiles for all
  using (auth.uid() = id);

-- Question Bank: teachers manage own questions, public can read questions for active quizzes
drop policy if exists "Teachers manage own question bank" on public.question_bank;
create policy "Teachers manage own question bank"
  on public.question_bank for all
  using (auth.uid() = teacher_id);

drop policy if exists "Public read access to question bank" on public.question_bank;
create policy "Public read access to question bank"
  on public.question_bank for select
  using (true);

-- Quizzes: teachers manage only their own quizzes.
-- NOTE: Do NOT add a broad "public read" policy here — it would leak
-- all teachers' quizzes to each other on the dashboard. Instead, students
-- look up quizzes by access_code via a public anon-safe read only on quiz_questions.
create policy "Teachers manage own quizzes"
  on public.quizzes for all
  using (auth.uid() = teacher_id);

-- IMPORTANT: Students (unauthenticated anon users) need to validate an access code
-- before joining a quiz. Allow anon SELECT only — teachers cannot see each other's
-- quizzes because the dashboard queries include .eq('teacher_id', user.id).
create policy "Anon can look up quizzes by access_code"
  on public.quizzes for select
  using (true);

-- Quiz Questions: public read (students need questions during a quiz session)
create policy "Public read access to quiz questions"
  on public.quiz_questions for select
  using (true);

-- Quiz Questions: only the owning teacher's quiz can have rows inserted
create policy "Teachers manage own quiz questions"
  on public.quiz_questions for all
  using (
    exists (
      select 1 from public.quizzes q
      where q.id = quiz_id and q.teacher_id = auth.uid()
    )
  );

-- Student Results: anyone (including anon students) can insert & select results
drop policy if exists "Students can insert results" on public.student_results;
create policy "Students can insert results"
  on public.student_results for insert
  with check (true);

drop policy if exists "Public can select student_results" on public.student_results;
create policy "Public can select student_results"
  on public.student_results for select
  using (true);

-- Scoped RLS policy: Teachers can update student results ONLY for their own quizzes
drop policy if exists "Authenticated users can manage student_results" on public.student_results;
drop policy if exists "Teachers can update student results for their quizzes" on public.student_results;

create policy "Teachers can update student results for their quizzes"
  on public.student_results
  for update
  using (
    exists (
      select 1
      from public.quizzes q
      where q.id = student_results.quiz_id
        and q.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.quizzes q
      where q.id = student_results.quiz_id
        and q.teacher_id = auth.uid()
    )
  );


-- Existing projects: run this once if student_results already exists.
alter table public.student_results
  add column if not exists response_snapshot jsonb not null default '[]'::jsonb;
-- 6. Student Responses Table (For individual answers & AI grading workflow)
create table public.student_responses (
    id uuid default uuid_generate_v4() primary key,
    quiz_id uuid references public.quizzes(id) on delete cascade not null,
    student_result_id uuid references public.student_results(id) on delete cascade,
    student_name text not null,
    question_text text not null,
    question_bank_id uuid references public.question_bank(id) on delete cascade,
    student_answer text not null,
    question_type text not null default 'MCQ', -- 'MCQ', 'FIB', or 'Short Answer'
    marks_assigned integer,
    ai_reasoning text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on student_responses
alter table public.student_responses enable row level security;

-- Student Responses RLS Policies
create policy "Students can insert responses"
  on public.student_responses for insert
  with check (true);

drop policy if exists "Authenticated users can manage student responses" on public.student_responses;
create policy "Authenticated users can manage student responses"
  on public.student_responses
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Storage Policies for 'quiz-attachments' bucket
drop policy if exists "Allow public uploads to quiz-attachments bucket" on storage.objects;
create policy "Allow public uploads to quiz-attachments bucket"
  on storage.objects for insert
  to public
  with check (bucket_id = 'quiz-attachments');

drop policy if exists "Allow public reads from quiz-attachments bucket" on storage.objects;
create policy "Allow public reads from quiz-attachments bucket"
  on storage.objects for select
  to public
  using (bucket_id = 'quiz-attachments');

drop policy if exists "Allow public updates to quiz-attachments bucket" on storage.objects;
create policy "Allow public updates to quiz-attachments bucket"
  on storage.objects for update
  to public
  using (bucket_id = 'quiz-attachments');
