alter table public.recipe_scraps add column cover_image text check (
  cover_image is null or (length(cover_image)<=160000 and cover_image ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+=*$')
);
