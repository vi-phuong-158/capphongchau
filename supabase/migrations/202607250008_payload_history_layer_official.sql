-- Migration: Allow 'OFFICIAL' layer in public_submission_payload_history constraint
alter table public.public_submission_payload_history
  drop constraint if exists public_submission_payload_history_layer_check,
  add constraint public_submission_payload_history_layer_check
    check (layer in ('CITIZEN', 'WORKING', 'OFFICIAL'));
