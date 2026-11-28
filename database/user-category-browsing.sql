CREATE TABLE public.user_category_browsing (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (
    category IN (
      'clothes',
      'books',
      'electronics',
      'furniture',
      'home-living',
      'toys-games',
      'baby-kids',
      'sports-outdoor',
      'shoes-accessories',
      'beauty-personal-care',
      'pet-supplies',
      'automotive-accessories',
      'musical-instruments',
      'miscellaneous'
    )
  ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_category_browsing ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.user_category_browsing TO authenticated;

CREATE POLICY "Users can view their own category browsing"
  ON public.user_category_browsing
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own category browsing"
  ON public.user_category_browsing
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own category browsing"
  ON public.user_category_browsing
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
