-- Run this once to set up and seed the database
-- Usage (local):  psql -U postgres -f seed.sql
-- Usage (RDS):    psql -h <RDS_ENDPOINT> -U postgres -f seed.sql

CREATE DATABASE shopdb;

\c shopdb

CREATE TABLE IF NOT EXISTS products (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  price      NUMERIC NOT NULL,
  category   TEXT,
  stock      INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert 10 sample products
INSERT INTO products (name, price, category, stock)
SELECT
  'Product ' || i,
  (random() * 100 + 10)::NUMERIC(10,2),
  CASE (i % 3)
    WHEN 0 THEN 'Electronics'
    WHEN 1 THEN 'Clothing'
    ELSE 'Books'
  END,
  floor(random() * 200)::INT
FROM generate_series(1, 10) AS i;

SELECT * FROM products;
