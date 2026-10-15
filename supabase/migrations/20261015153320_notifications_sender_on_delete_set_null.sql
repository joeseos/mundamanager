-- Keep a notification when the sender's account is deleted.
-- sender_id is nullable; the account page already omits "From" when it is null.
-- ON DELETE CASCADE used to remove every notification that user had sent,
-- including admin broadcasts.

ALTER TABLE public.notifications
    DROP CONSTRAINT notifications_sender_id_fkey;

ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_sender_id_fkey
    FOREIGN KEY (sender_id)
    REFERENCES auth.users(id)
    ON DELETE SET NULL;
