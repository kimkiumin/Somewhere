SELECT CASE
  WHEN NOT EXISTS (
    SELECT 1
    FROM operations_meter_reservations AS reservation
    JOIN operations_write_fence AS fence
      ON fence.environment = 'staging'
    WHERE reservation.reservation_state = 'reserved'
      AND reservation.write_epoch <> fence.write_epoch
  ) THEN 'PASS'
  ELSE 'FAIL'
END AS gate;
