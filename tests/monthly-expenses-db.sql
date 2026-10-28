-- Run against a database with an existing active owner; all test writes roll back.
BEGIN;
DO $$
DECLARE sid uuid; uid uuid; root_id uuid; rid uuid; feb_id uuid; count_before integer; count_after integer; denied boolean := false;
BEGIN
    SELECT store_id,user_id INTO STRICT sid,uid FROM public.store_members WHERE role='owner' AND is_active LIMIT 1;
    PERFORM set_config('request.jwt.claim.sub',uid::text,true);
    root_id := public.save_expense(sid,NULL,'2024-01-31','차량 기름값',100,'temporary recurrence verification',true);
    SELECT recurrence_id INTO rid FROM public.expenses WHERE id=root_id;
    PERFORM public.sync_recurring_expenses(sid);
    IF NOT EXISTS(SELECT 1 FROM public.expenses WHERE recurrence_id=rid AND expense_date='2024-02-29') THEN RAISE EXCEPTION 'Leap February failed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.expenses WHERE recurrence_id=rid AND expense_date='2025-02-28') THEN RAISE EXCEPTION 'February failed'; END IF;
    IF EXISTS(SELECT 1 FROM public.expenses WHERE recurrence_id=rid AND expense_date>current_date) THEN RAISE EXCEPTION 'Future entries created'; END IF;
    SELECT count(*) INTO count_before FROM public.expenses WHERE recurrence_id=rid;
    PERFORM public.sync_recurring_expenses(sid);
    SELECT count(*) INTO count_after FROM public.expenses WHERE recurrence_id=rid;
    IF count_before<>count_after THEN RAISE EXCEPTION 'Duplicate recurring expenses'; END IF;
    SELECT id INTO feb_id FROM public.expenses WHERE recurrence_id=rid AND expense_date='2024-02-29';
    PERFORM public.save_expense(sid,feb_id,'2024-02-29','쇼핑',77,'edit this occurrence',false);
    IF (SELECT active FROM public.expense_recurrences WHERE id=rid) THEN RAISE EXCEPTION 'Stop repeat failed'; END IF;
    IF (SELECT amount FROM public.expenses WHERE id=root_id)<>100 THEN RAISE EXCEPTION 'Historical amount changed'; END IF;
    PERFORM public.delete_expenses(sid,ARRAY[feb_id]);
    UPDATE public.expense_recurrences SET active=true WHERE id=rid;
    PERFORM public.sync_recurring_expenses(sid);
    IF EXISTS(SELECT 1 FROM public.expenses WHERE id=feb_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Deleted occurrence resurrected'; END IF;
    BEGIN
        PERFORM public.save_expense(gen_random_uuid(),NULL,current_date,'쇼핑',10,'denied',false);
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Cross store write allowed'; END IF;
    IF has_function_privilege('anon','public.save_expense(uuid,uuid,date,text,numeric,text,boolean)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous writes allowed'; END IF;
END $$;
ROLLBACK;
SELECT true AS recurring_expense_checks_passed;
