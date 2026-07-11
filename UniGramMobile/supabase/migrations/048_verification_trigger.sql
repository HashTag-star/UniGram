-- 044_verification_trigger.sql
-- Automatically update user profiles, create in-app notifications,
-- and clean up sensitive documents from storage when verification requests
-- are approved or rejected.

CREATE OR REPLACE FUNCTION public.handle_verification_request_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    -- 1. Sync verified status, type, and university to profiles
    UPDATE public.profiles
    SET is_verified = true,
        verification_type = NEW.type,
        university = COALESCE(NEW.university, profiles.university)
    WHERE id = NEW.user_id;

    -- 2. Create in-app notification
    INSERT INTO public.notifications (user_id, type, text, actor_id)
    VALUES (
      NEW.user_id,
      'verification_approved',
      'Your request for ' || NEW.type || ' verification has been approved.',
      NEW.user_id
    );

    -- 3. Securely clean up uploaded document files (Data Minimization compliance)
    IF NEW.document_urls IS NOT NULL AND array_length(NEW.document_urls, 1) > 0 THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'verifications'
        AND name = ANY(
          SELECT substring(url from '[^/]+$')
          FROM unnest(NEW.document_urls) AS url
        );
    END IF;

  ELSIF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    -- 1. Revert verified status on profiles
    UPDATE public.profiles
    SET is_verified = false,
        verification_type = null
    WHERE id = NEW.user_id;

    -- 2. Create in-app notification
    INSERT INTO public.notifications (user_id, type, text, actor_id)
    VALUES (
      NEW.user_id,
      'verification_rejected',
      'Your request for ' || NEW.type || ' verification was rejected.',
      NEW.user_id
    );

    -- 3. Securely clean up uploaded document files (Data Minimization compliance)
    IF NEW.document_urls IS NOT NULL AND array_length(NEW.document_urls, 1) > 0 THEN
      DELETE FROM storage.objects
      WHERE bucket_id = 'verifications'
        AND name = ANY(
          SELECT substring(url from '[^/]+$')
          FROM unnest(NEW.document_urls) AS url
        );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verification_request_status_change ON public.verification_requests;
CREATE TRIGGER trg_verification_request_status_change
  AFTER UPDATE OF status ON public.verification_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_verification_request_status_change();
