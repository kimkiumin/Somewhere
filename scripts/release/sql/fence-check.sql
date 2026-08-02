SELECT CASE
  WHEN COUNT(*) = 1 AND MIN(mode) <> 'OPEN' THEN 'PASS'
  ELSE 'FAIL'
END AS gate
FROM operations_write_fence
WHERE environment = 'staging';
