CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"category" text,
	"stock" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
