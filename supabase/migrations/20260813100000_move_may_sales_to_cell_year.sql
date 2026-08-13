-- One-time correction approved by the owner: the May workbook filename said
-- 2025, but its authoritative sale cells are dated May 2026.
DO $$
DECLARE
    v_updated integer := 0;
BEGIN
    UPDATE public.orders
       SET order_date = (order_date + interval '1 year')::date,
           ship_date = CASE
               WHEN ship_date >= DATE '2025-05-01' AND ship_date < DATE '2025-06-01'
               THEN (ship_date + interval '1 year')::date
               ELSE ship_date
           END,
           updated_at = now()
     WHERE deleted_at IS NULL
       AND notes = 'Historical Excel import'
       AND order_date >= DATE '2025-05-01'
       AND order_date < DATE '2025-06-01';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'Moved May historical Excel sales to cell year 2026: updated=%', v_updated;
END;
$$;
