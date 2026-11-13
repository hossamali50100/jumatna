-- (036) أكتر من صورة في المنشور الواحد (حد أقصى 4):
-- الصورة الأولى في image_url زي الأول، والباقي (لحد 3) في extra_images.
create or replace function public.valid_media_urls(u text[]) returns boolean
language sql immutable as $$
  select coalesce(bool_and(x ~ '^https://[^/]+/storage/v1/object/public/media/'), true) from unnest(u) x
$$;
alter table public.posts add column if not exists extra_images text[] not null default '{}';
alter table public.posts drop constraint if exists posts_extra_images_chk;
alter table public.posts add constraint posts_extra_images_chk
  check (cardinality(extra_images) <= 3 and public.valid_media_urls(extra_images)
         and (cardinality(extra_images) = 0 or image_url is not null));
notify pgrst, 'reload schema';
