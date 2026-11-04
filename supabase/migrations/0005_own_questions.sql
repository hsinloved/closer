-- Your own questions: either of you can write a card instead of drawing one from the deck.
-- It is a round like any other (sealed answers, reveal, comments); the question text lives on the round.
alter table public.rounds add column question text
  check (question is null or char_length(question) between 1 and 300);
alter table public.rounds drop constraint rounds_lv_check;
alter table public.rounds add constraint rounds_lv_check check (lv in ('know', 'play', 'world', 'deep', 'wild', 'own'));
alter table public.rounds add constraint rounds_own_question check ((lv = 'own') = (question is not null));
