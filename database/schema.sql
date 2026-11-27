-- User-created categories organize saved items without changing the original listings.
CREATE TABLE public.saved_categories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name character varying NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT saved_categories_name_not_empty CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX saved_categories_user_lower_name_key
  ON public.saved_categories (user_id, lower(name));

-- Each saved item can belong to multiple custom categories.
CREATE TABLE public.saved_category_items (
  category_id bigint NOT NULL REFERENCES public.saved_categories(id) ON DELETE CASCADE,
  saved_item_id bigint NOT NULL REFERENCES public.saved_items(id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, saved_item_id)
);

CREATE INDEX saved_category_items_saved_item_id_idx
  ON public.saved_category_items (saved_item_id);

ALTER TABLE public.saved_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_category_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY saved_categories_owner_access
  ON public.saved_categories
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY saved_category_items_owner_access
  ON public.saved_category_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.saved_categories AS category
      WHERE category.id = saved_category_items.category_id
        AND category.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.saved_items AS saved_item
      WHERE saved_item.id = saved_category_items.saved_item_id
        AND saved_item.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.saved_categories AS category
      WHERE category.id = saved_category_items.category_id
        AND category.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.saved_items AS saved_item
      WHERE saved_item.id = saved_category_items.saved_item_id
        AND saved_item.user_id = auth.uid()
    )
  );
