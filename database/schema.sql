-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.
-- Datbase used is Supabase Postgres

/*
CREATE TABLE public.user_profiles (
  id uuid NOT NULL,
  username character varying NOT NULL UNIQUE,
  location character varying NOT NULL,
  avatar_url text,
  role character varying NOT NULL DEFAULT 'user'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email character varying NOT NULL UNIQUE,
  CONSTRAINT user_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  donor_id uuid NOT NULL,
  title character varying,
  description character varying,
  location character varying,
  item_type character varying,
  condition_type character varying,
  delivery_type character varying,
  photo_urls ARRAY,
  status character varying DEFAULT 'drafted'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT items_pkey PRIMARY KEY (id),
  CONSTRAINT items_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.reviews (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  reviewed_user_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  star_rating bigint NOT NULL DEFAULT '1'::bigint,
  comment text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_reviewed_user_id_fkey FOREIGN KEY (reviewed_user_id) REFERENCES public.user_profiles(id),
  CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.chatrooms (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  donor_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chatrooms_pkey PRIMARY KEY (id),
  CONSTRAINT chatrooms_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.user_profiles(id),
  CONSTRAINT chatrooms_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.messages (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  chatroom_id bigint NOT NULL,
  sender_id uuid NOT NULL,
  item_id bigint,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  image_url text,
  edited_at timestamp with time zone,
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_chatroom_id_fkey FOREIGN KEY (chatroom_id) REFERENCES public.chatrooms(id),
  CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.user_profiles(id),
  CONSTRAINT messages_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE TABLE public.appointments (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  donor_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  location character varying NOT NULL,
  date date NOT NULL,
  time time without time zone NOT NULL,
  status character varying NOT NULL DEFAULT 'pending'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT appointments_pkey PRIMARY KEY (id),
  CONSTRAINT appointments_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES public.user_profiles(id),
  CONSTRAINT appointments_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.appointment_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  appointment_id bigint NOT NULL,
  item_id bigint NOT NULL,
  CONSTRAINT appointment_items_pkey PRIMARY KEY (id),
  CONSTRAINT appointment_items_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES public.appointments(id),
  CONSTRAINT appointment_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE TABLE public.cart_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  item_id bigint NOT NULL,
  CONSTRAINT cart_items_pkey PRIMARY KEY (id),
  CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id),
  CONSTRAINT cart_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE TABLE public.saved_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  item_id bigint NOT NULL,
  categories_id ARRAY,
  CONSTRAINT saved_items_pkey PRIMARY KEY (id),
  CONSTRAINT saved_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id),
  CONSTRAINT saved_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id)
);
CREATE TABLE public.wishlist_keywords (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  keyword character varying NOT NULL,
  CONSTRAINT wishlist_keywords_pkey PRIMARY KEY (id),
  CONSTRAINT wishlist_keywords_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.search_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  search_query character varying,
  category character varying,
  location character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT search_history_pkey PRIMARY KEY (id),
  CONSTRAINT search_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id)
);
CREATE TABLE public.saved_categories (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL,
  name character varying NOT NULL,
  CONSTRAINT saved_categories_pkey PRIMARY KEY (id),
  CONSTRAINT saved_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(id)
);
*/