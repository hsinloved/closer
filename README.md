# Closer

**A dating app made for you and your partner.** Questions to get to know each other, play a little, and slowly go deeper.

**Two ways to play.** Answer one card a day from your own phones: answers stay sealed until you've both
written, and the other gets a notification. Or sit together and play the in-person game at `/together.html`.

Setup for the two-player version: see [SETUP.md](SETUP.md).

Made for a Taiwanese–German couple, so there's a whole level about the space between two cultures.

---

## How to play

1. Enter both names.
2. Tap the deck to draw a card. The player shown answers first, then the other answers too.
3. Hit **Next card** to swap turns, or **Pass** to skip a card without swapping.
4. **Save** the cards you want to come back to.

There's only one rule: be honest.

## Modes

| Mode | How it works |
| --- | --- |
| **Free play** | Pick any level, any time. Switch whenever the mood changes. |
| **Journey** | Go step by step: Know → Play → Worlds → Deeper, 8 cards each, then a final card for both of you. |

## The deck: 183 cards

| Level | Cards | What it's for |
| --- | --- | --- |
| **Know** | 42 | Easy openers to learn the basics |
| **Play** | 42 | Games, dares and would-you-rathers |
| **Worlds** | 41 | Taiwan meets Germany: language, family, food, home |
| **Deeper** | 42 | Slow down. Real answers only |
| **Wild** | 16 | Show up at random, and you both play |

**Mix** shuffles the four question levels together.

## Good to know

- Works on phones and laptops. Add it to your home screen to use it like an app.
- In-person mode keeps everything in your browser. The two-player app stores your answers in your own Supabase project, readable only by your two accounts.
- It's built for one device you share. Each device keeps its own game.
- The two-player app is Vite + Preact, with Supabase for sign-in and data, and Vercel for hosting and notifications.
- The in-person game is still a single self-contained file: `public/together.html`.

## Host your own copy

Fork the repo and follow [SETUP.md](SETUP.md): a free Supabase project, a Vercel project, and two phone settings.

---

<sub>Inspired by conversation card games. All questions are original.</sub>
