BEGIN;

CREATE TABLE public.expense_recurrences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id),
    start_date date NOT NULL,
    day_of_month integer NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    category text NOT NULL,
    amount numeric NOT NULL CHECK (amount > 0),
    description text,
    active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.expenses ADD COLUMN recurrence_id uuid REFERENCES public.expense_recurrences(id);
ALTER TABLE public.expenses ADD COLUMN occurrence_month date;
CREATE UNIQUE INDEX expenses_recurrence_month_unique ON public.expenses(recurrence_id, occurrence_month)
    WHERE recurrence_id IS NOT NULL;
ALTER TABLE public.expense_recurrences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expense_recurrences FROM anon, authenticated;
GRANT SELECT ON public.expense_recurrences TO authenticated;
CREATE POLICY expense_recurrences_read ON public.expense_recurrences FOR SELECT TO authenticated
    USING (private.current_store_role(store_id) IS NOT NULL);

CREATE FUNCTION public.sync_recurring_expenses(p_store_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.expense_recurrences; m date; due date; added integer := 0; n integer;
BEGIN
    IF auth.uid() IS NULL OR private.current_store_role(p_store_id) IS NULL THEN
        RAISE EXCEPTION 'Authentication and store membership required' USING ERRCODE='42501';
    END IF;
    FOR r IN SELECT * FROM public.expense_recurrences WHERE store_id=p_store_id AND active FOR UPDATE LOOP
        FOR m IN SELECT d::date FROM pg_catalog.generate_series(date_trunc('month',r.start_date)::date,
                date_trunc('month',current_date)::date,interval '1 month') d LOOP
            due := m + (least(r.day_of_month,extract(day FROM (m+interval '1 month - 1 day'))::integer)-1);
            IF due >= r.start_date AND due <= current_date THEN
                INSERT INTO public.expenses(store_id,expense_date,category,amount,description,recurrence_id,occurrence_month)
                VALUES(r.store_id,due,r.category,r.amount,r.description,r.id,m)
                ON CONFLICT(recurrence_id,occurrence_month) WHERE recurrence_id IS NOT NULL DO NOTHING;
                GET DIAGNOSTICS n = ROW_COUNT;
                added := added+n;
            END IF;
        END LOOP;
    END LOOP;
    RETURN added;
END $$;

CREATE FUNCTION public.save_expense(p_store_id uuid,p_expense_id uuid,p_expense_date date,
    p_category text,p_amount numeric,p_description text,p_monthly boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing public.expenses; rid uuid; eid uuid;
BEGIN
    IF auth.uid() IS NULL OR coalesce(private.current_store_role(p_store_id)::text,'') NOT IN ('owner','manager') THEN
        RAISE EXCEPTION 'Expense write permission required' USING ERRCODE='42501';
    END IF;
    IF p_expense_date IS NULL OR nullif(btrim(p_category),'') IS NULL OR p_amount IS NULL OR p_amount<=0 THEN
        RAISE EXCEPTION 'Date, category and positive amount required' USING ERRCODE='22023';
    END IF;
    IF p_expense_id IS NOT NULL THEN
        SELECT * INTO existing FROM public.expenses WHERE id=p_expense_id AND store_id=p_store_id AND deleted_at IS NULL FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found' USING ERRCODE='22023'; END IF;
        rid:=existing.recurrence_id;
        IF rid IS NOT NULL AND date_trunc('month',p_expense_date)::date<>existing.occurrence_month THEN
            RAISE EXCEPTION '반복 경비의 월은 변경할 수 없습니다. 해당 월 안에서 날짜를 선택하세요.' USING ERRCODE='22023';
        END IF;
    END IF;
    IF p_monthly AND rid IS NULL THEN
        INSERT INTO public.expense_recurrences(store_id,start_date,day_of_month,category,amount,description)
        VALUES(p_store_id,p_expense_date,extract(day FROM p_expense_date)::integer,btrim(p_category),p_amount,p_description)
        RETURNING id INTO rid;
    ELSIF rid IS NOT NULL THEN
        UPDATE public.expense_recurrences SET active=p_monthly,category=btrim(p_category),amount=p_amount,description=p_description
            WHERE id=rid AND store_id=p_store_id;
    END IF;
    IF p_expense_id IS NULL THEN
        INSERT INTO public.expenses(store_id,expense_date,category,amount,description,recurrence_id,occurrence_month)
        VALUES(p_store_id,p_expense_date,btrim(p_category),p_amount,p_description,rid,
            CASE WHEN rid IS NOT NULL THEN date_trunc('month',p_expense_date)::date END) RETURNING id INTO eid;
    ELSE
        UPDATE public.expenses SET expense_date=p_expense_date,category=btrim(p_category),amount=p_amount,
            description=p_description,recurrence_id=rid,
            occurrence_month=CASE WHEN rid IS NOT NULL THEN date_trunc('month',p_expense_date)::date END
            WHERE id=existing.id RETURNING id INTO eid;
    END IF;
    RETURN eid;
END $$;

CREATE FUNCTION public.delete_expenses(p_store_id uuid,p_expense_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
    IF auth.uid() IS NULL OR coalesce(private.current_store_role(p_store_id)::text,'') NOT IN ('owner','manager') THEN
        RAISE EXCEPTION 'Expense write permission required' USING ERRCODE='42501';
    END IF;
    UPDATE public.expense_recurrences SET active=false WHERE store_id=p_store_id AND id IN
        (SELECT recurrence_id FROM public.expenses WHERE store_id=p_store_id AND id=ANY(p_expense_ids) AND deleted_at IS NULL);
    UPDATE public.expenses SET deleted_at=now() WHERE store_id=p_store_id AND id=ANY(p_expense_ids) AND deleted_at IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.sync_recurring_expenses(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense(uuid,uuid,date,text,numeric,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_expenses(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_recurring_expenses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense(uuid,uuid,date,text,numeric,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expenses(uuid,uuid[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
