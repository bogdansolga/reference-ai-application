-- Hand-written: the PDF source is retired (the decks are the knowledge base); clear it before the unique constraint.
DELETE FROM "chunks" WHERE "document_id" IN (SELECT "id" FROM "documents" WHERE "filename" ILIKE '%.pdf');--> statement-breakpoint
DELETE FROM "documents" WHERE "filename" ILIKE '%.pdf';--> statement-breakpoint
ALTER TABLE "chunks" DROP CONSTRAINT "chunks_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source" text DEFAULT 'deck' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "content_hash" text;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_filename_unique" UNIQUE("filename");