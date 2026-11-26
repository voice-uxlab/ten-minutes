-- Run as the DB administrator after configuring the Vault secrets in docs/deployment.md.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Give open connections created before heartbeat support a final grace period.
update public.realtime_calls
set hangup_at = now() + interval '2 minutes'
where closed_at is null
  and hangup_at = '9999-12-31 23:59:59.999999+00'::timestamptz;

select cron.schedule(
    'ten-minutes-voice-cleanup',
    '* * * * *',
    $job$
    select net.http_post(
        url := rtrim(endpoint.decrypted_secret, '/') || '/api/v1/internal/voice-cleanup',
        headers := jsonb_build_object('Authorization', 'Bearer ' || auth.decrypted_secret)
            || coalesce((
                select jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
                from vault.decrypted_secrets
                where name = 'voice_cleanup_vercel_bypass'
            ), '{}'::jsonb),
        timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets as endpoint
    cross join vault.decrypted_secrets as auth
    where endpoint.name = 'voice_cleanup_backend_origin'
      and endpoint.decrypted_secret like 'https://%'
      and auth.name = 'voice_cleanup_secret'
      and auth.decrypted_secret <> ''
      and exists (
          select 1
          from public.realtime_calls
          where closed_at is null and hangup_at <= now()
      );
    $job$
);

-- Report jobs run separately so a voice provider error cannot block generation.
select cron.schedule(
    'ten-minutes-report-generation',
    '* * * * *',
    $job$
    select net.http_post(
        url := rtrim(endpoint.decrypted_secret, '/') || '/api/v1/internal/report-generation',
        headers := jsonb_build_object('Authorization', 'Bearer ' || auth.decrypted_secret)
            || coalesce((
                select jsonb_build_object('x-vercel-protection-bypass', decrypted_secret)
                from vault.decrypted_secrets
                where name = 'voice_cleanup_vercel_bypass'
            ), '{}'::jsonb),
        timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets as endpoint
    cross join vault.decrypted_secrets as auth
    where endpoint.name = 'voice_cleanup_backend_origin'
      and endpoint.decrypted_secret like 'https://%'
      and auth.name = 'voice_cleanup_secret'
      and auth.decrypted_secret <> ''
      and exists (
          select 1
          from public.consultation_report_drafts
          where run_at <= now()
      );
    $job$
);
