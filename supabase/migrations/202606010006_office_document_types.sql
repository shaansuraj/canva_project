-- Phase 5 hardening: accept Office source files as saved meeting documents.
-- Rendering still requires conversion to PDF; PDF/image remain immediate annotation formats.

alter type public.document_type add value if not exists 'doc';
alter type public.document_type add value if not exists 'docx';
alter type public.document_type add value if not exists 'xls';
alter type public.document_type add value if not exists 'xlsx';
