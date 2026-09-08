# The Rivenmark — the whole game

A mobile-first top-down extraction ARPG. You descend into a delve, cut Arcane
Slag out of the hive-mind's dead, and hold a ley-gate open long enough to carry
the haul out. Die and it stays on the floor where you fell.

Every number in this document is read out of the source, not remembered. Where
a value is tuned rather than obvious, the reasoning is with it — that is the
point of the document.

- **Repository:** `abdulalrubat-bit/the-rivenmark` (private)
- **Ships as:** an Android WebView APK, and an installable PWA
- **Built from:** `phaser/` — see *Two builds* at the end

---

## 1. The world

The Aegis shattered. What it held back came through, and what came through
does not think for itself: the **hive-mind** wears the dead of the people who
lived here, and every body in a delve is somebody it is still using. The land
under it is the **Rivenmark**, and the dark over it is the **Shroud of Dúath**.

Magic is lethal to touch and useless at a distance, so it is run through
**Spirit-wrought Steel**. The blade is a conduit: you swing, and the magic
leaves the edge as a **crescent** that carries a short way and cuts everything
it sweeps through. That single fact is the whole combat system — the blade is
not a sword, it is a way of throwing.

**Arcane Slag** is what the hive-mind leaves in the bodies it wears. It is the
currency, the experience, and the reason to be down there.

### The five regions

Each is a distinct cut of ground with its own palette, layout rules, lamp
colour and landmark — and, since the Regalia was sundered across them, its own
piece of it.

| Region | Landmark | Ground | Keeps |
|---|---|---|---|
| The Slag-Moors of Drak-Hald | The Weeping Keep of Tor-Varden | dead ash | the off-hand |
| The Rending Gorges of Vaelk | The Kael-Dorm Redoubt | split earth | the boots and the girdle |
| Kraggen-Tor, the Iron-Teeth | The Shatter-Gate of Ghor | volcanic west | the mail |
| The Rot-Weald | The Heart-Rot Clearing | creeping mutation | the rings |
| The Dead Firth | The Ash-Shoals | a drained ocean | the blade and the amulet |

---

## 2. The core loop

```
gate-house → choose rung, hero, ground → descend
   → cut slag from the horde until the quota is met
   → the quota draws the avatar to the gate; break him
   → stand in the ley-gate and channel it open
   → step through, or hold it open for more and risk everything
back to the gate-house → bank, spend, forge → descend again
```

**Extraction is the objective, not survival.** There is no timer and no wave
counter. A delve ends when you walk out of it or when you die in it.

### The gate in detail

1. **The quota.** Each rung names how much slag opens its gate:
   `quota = 125 + depth × 145`, so 125 on the first rung and 270 on the
   fifty-second. The delve is populated with **1.42×** that much, so some packs
   can be left alone.
2. **Reaching the quota does not open the gate — it draws him to it.** The
   Gilded Deceiver spawns the moment the quota is met.
3. **`portal.active` requires the quota AND `bossDown`.** Until he is broken,
   the circle does nothing.
4. **The channel.** Standing inside `PORTAL_R` (62 units) for `channel` (4.0s)
   winds it open. Step out and it unwinds at 0.7× the rate.
5. **Step through, or hold.** Once open you may leave — or stay, and the delve
   comes for the gate in surges of `HOLD_WAVE` 30s with a `HOLD_LULL` 6s tail
   you can escape in. The budget of bodies per surge is `12 + wave × 7`.

### What you lose

Dying leaves everything **unbanked** on the floor as a corpse: up to
`CORPSE_CARRY` 10 pieces plus the coin. **What you are wearing always comes
home** — losing your kit to one bad tap would make every delve a decision about
whether to risk playing at all. Only one corpse exists at a time, and it is
named at the gate-house so you know where it is.

---

## 3. The Guided Vanguard

Two of the Clear-Sighted, both fighting **unhelmeted** — the compendium is
explicit that they look the darkness in the eye, so the sprites show the face
and the weapon carries the order.

| | **Isaac**, The Unyielding Shield | **Zayd**, The Piercing Truth |
|---|---|---|
| Order | Hearth-Wardens | Frost-Scholars of Kael |
| School | Sun-Gold | Azure |
| Arms | Sun-emblazoned shield, golden sword | The Sapphire Glaive |
| Life | 125 | 92 |
| Stride | 196 | 228 |
| Ward | 22 | 17 |
| Swing | every 0.62s | every 0.48s |
| Reach | 178 | 206 |
| Sweep (half-width) | 33 | 21 |
| Immune to | the Deceiver's illusions | inverted ley-lines |

You carry both. **Swapping is instant and free**, and each keeps his own
wounds for the length of a run (`run.pools`), so putting one down at 30 life
means picking him up at 30 life.

### The swing, and what it is worth

**The blade does not swing itself.** It used to — a target and a timer, no
input at all — and that was the whole of the attack before the Conduit
existed. It was kept afterwards as a kindness, so that one thumb or no thumb
still played. The kindness was the problem: with it in, standing still and
pressing nothing killed things, and the Conduit was an optional way to kill
them faster. Two attack systems at once, one of which nobody chose.

It was measured twice, and the second measurement is why it went. First, when
the swing was written down to 0.62 of a real blow to stop it winning fights on
its own: **seven tenths** of every point of damage came off it and a sixth off
the six buttons, with the bar's share *falling* with depth. That helped, and
it did not fix anything — the second measurement, over ninety-six delves
across six rungs, found the crescent still carrying **39% to 60%** of all
damage dealt by a reference player *who never once touched the control*.
Between a third and two thirds of the game was being played by nobody.

So there is no swing nobody asked for. Every crescent is worth the whole of
`damage`, and comes round because you asked for it: a **tap** (which still
finds its own target — the accessible one-thumb swing is intact, it simply has
to be pressed), a **held drag** down a line you choose, or a **gather**. What
you cannot do any more is decline to fight.

---

## 4. The kit

Six buttons, bottom-right, on a shared beat. `GCD_TIME` is **1.2s** and each
ability multiplies it — the **primary is on 0.8**, everything else on 1.0, so
pressing it is a rhythm rather than a decision you fit between other decisions.
The beat locks the ability bar and *nothing else*: moving, swinging and
drinking are never taken away.

### Isaac — Sun-Gold, and Charges (max 3)

| | | |
|---|---|---|
| ✦ | **Anchoring Strike** | 3.4× the ward at reach 96. **Breaks a braced guard**, and throws what it hits. Builds a Charge. |
| ◉ | **Aegis of Tor-Varden** | Spends three. 3.2× in a 150 ring, and a moment at half harm behind the guard. |
| ▣ | **Unyielding Mass** | 12s. Rooted, unmovable, half harm, for four seconds. |
| ✚ | **Grounding Purge** | 14s. Channelled three seconds for 15% of your life. Breaks the moment you are struck or move. |
| ⚔ | **Star-Forged Guillotine** | Spends three. 7× on one body — and **×5 again** on the Metaphysically Vulnerable. |

### Zayd — Azure, and Ley-Tension (max 100)

| | | |
|---|---|---|
| ↠ | **Piercing Truth** | 2.2× in a **line** 340 long, through everything standing in it. Builds 14 Tension per body. |
| ◍ | **Null-Zone Eruption** | Spends two fifths. A pool that slows what stands in it and **eats what it is casting**. |
| ⌁ | **Focal Decryption** | 8s, **off the beat**. Snaps a cast at 300, silences for three, and gives the Tension back. |
| ⚱ | **Crimson-Infused Jars** | Three to a delve. Instant, 45% of your life. |

---

## 5. Weight — what a blow does besides subtract a number

Every `freeze()` and `shake()` in the game used to sit inside an ability
handler. `damageEnemy` — the path the ordinary swing travels, and most of your
damage — did a hit-flash, a damage number and two particles. The blow you land
constantly was the only blow with nothing behind it.

Now, scaled by **the share of the body the blow took**, never by the number
(twenty-two off a thrall is most of it; off the avatar it is a scratch):

- **A recoil** along the direction the blow travelled. Mass divides it, so the
  same crescent throws a thrall six units and turns a gorger one. A braced
  anchor takes none — it cannot move while the guard is up, and backing off
  rather than shoving is the whole answer to one.
- **A spray** that grows with the share taken.
- **The camera**, on a heavy landing only. A thrall dies in two, so shaking on
  every landing would never let it settle.
- **A hit-stop on the KILL, not the hit.** At two and a half landings a second
  against about four fifths of a kill, a freeze per landing is a stutter you
  read as a bad frame rate; a freeze per kill is punctuation. `KILL_FREEZE`
  0.045s, ×1.6 for a big body, capped at `HITSTOP_MAX` 0.09.

The killing blow does **not** push the corpse: `knock()` refuses a dead body,
and the topple pivots on its feet.

---

## 6. The horde

**Packs, not waves.** The delve is populated at generation time and cleared by
walking into it. Nothing is ever pushed at you. Packs sit dormant until
something wakes them, so pressure comes from what you walk into.

- `PACK_SAFE` **360** — no pack within this of the spawn
- `PACK_APART` **250** — minimum spacing between pack sites
- `AGGRO_NEAR` **250** / `AGGRO_FAR` **340** — a body notices you; the bigger,
  slower ones sooner
- `ALERT_R` **155** with a 0.18s delay — a woken body pulls its neighbours up
  one beat later, so a pack rouses *in sequence*
- `HORDE_LIVE` **46** awake at once, `MAX_ENEMIES` **340** placed

The cap is on bodies **awake**, not bodies placed. Applied to placement it
breaks extraction outright: a delve holds 1.42× its own quota at roughly one
slag a thrall, and the map would no longer contain enough to open its own gate.

### Clamour — how much of the delve can hear you

The design this came from was written against a delve that does not exist. It
said the fight is unreadable because forty-six bodies are up at once; the
instrument measured **three to thirteen at the median**, against a cap of
forty-six that is a spike and not a constant. The delve is *already* mostly
asleep, and "cut the horde" was a plan to change something already true.

What is true is the gradient — 3 awake at the mouth, 13 at the deep end, and
the share of a quota taken with sixteen or more up running 12% to 46%. So
Clamour does not make the delve sleep. It makes the sleeping **visible**, puts
it under your hand, and gives it consequences.

One number, 0 to 1. Loud things raise it; it falls with time. What it buys is
**reach**: a loud hero is noticed from further off, through the same aggro
test a body already ran. Nothing else changes — no senses model, no cones.

| | |
|---|---|
| `CLAMOUR_DECAY` **0.085**/s | a swing paid off in ~1s, a gathered one in ~2.6, a full meter in ~12 |
| `CLAMOUR_REACH` **0.85** | at full, `AGGRO_NEAR` 250 reaches **463** |
| `CLAMOUR_SWING` **0.085** | a crescent, asked for |
| `CLAMOUR_HEAVY` **0.22** | a gathered one, which is a real noise |
| `CLAMOUR_CAST` **0.13** | anything off the bar |
| `CLAMOUR_CRY` **0.085**/s | a fight at full cry — exactly one decay's worth |
| `CLAMOUR_VOICES` **4** | bodies near you that add up to full cry |
| `CLAMOUR_NEAR` **420** | ...and how near "near you" is |

**What is loud is a short list, and short on purpose: things you chose.**
Swinging, and spending. Being hit is not — you did not pick it. **Moving is
not loud at any speed**, and the meter **decays on a clock rather than on
standing still**. Those two lines are the whole anti-stealth guarantee: a
meter that only falls while you stand still *is* a stealth game, because it
makes waiting the optimal move and turns every room into a pause.

**And the fight makes its own noise, every second it lasts.** That list of
chosen things left one exploit standing, and it is the obvious one: stop
swinging, circle, let the meter drain, come back in. Under a meter that hears
only your own blade, the quietest way through a room is to fight it as slowly
as possible — creeping, arrived at from the opposite direction.

So bodies up and around you feed the meter on a clock of their own. Not per
blow landed, not per blow taken — being hit is still not loud, for the reason
it never was — so the total noise of a fight is its **duration**, which is the
one thing about a fight the player fully controls. Kill four things in five
seconds and you pay five seconds of it; take twenty and you pay twenty. That
is what makes the quiet play and the aggressive play the *same* play, which is
the entire point of the meter. Before it, they were opposites.

The rate is set against the decay rather than chosen for feel: at full cry it
is exactly `CLAMOUR_DECAY`, so a fight you are only surviving **holds** the
meter where it is and a fight you are winning climbs it. Measured, over five
seconds from a meter at 0.6: an empty room loses **0.425**, one body up loses
**0.319**, and four or more move it **0.001**. You cannot wait out a fight you
are standing in the middle of. You can still walk away from one — that door is
deliberately left open, because closing it makes the terrain an off switch,
and because walking away already costs the thing that costs: the slag you did
not collect while you were doing it.

**It saturates, and that matters more than the rate.** A brawl is a brawl at
four bodies or forty — noise that scaled with the crowd would make the deep
rungs deafening through nothing the player did, and would hand the horde a
meter that is supposed to be the hero's own. Forty measured **0.001**, the
same as four.

The guarantee is re-checked *under* the new term rather than assumed to
survive it, because a per-second noise is exactly the kind of change that
quietly makes stillness a move: the same fight, once stood through and once
run through, moves the meter to **0.4986** either way.

That is not asserted, it is measured. `dawdle.js` plays the same delves twice
— once normally, once standing still whenever the meter is up — with a hero
who cannot die, so survival is out of the comparison and only efficiency is
left. Waiting gathers about **half** the slag in the same time (49%, 52%, 55%
over three runs). It is *reported* per rung and *asserted* pooled, because ten
delves cannot resolve one rung: the per-rung figure came back at 172%, 92% and
84% on three runs of the identical build.

### The settle

Without a way back down, Clamour is a ratchet — every noise wakes something,
nothing ever sleeps again, and the meter is only a slower road to the same
fully-woken delve.

So a body that has lost you walks back to where it was standing and goes
dormant. "Lost you" is the *same* test that woke it, so the two cannot
disagree, and a loud hero is correspondingly harder to shake.

`SETTLE_WAIT` **6s** — long enough that stepping behind a wall does not switch
the fight off, short enough that a room you left is quiet again by the time you
have crossed the next one. `SETTLE_NEAR` **40** units of its bed.

**Losing you has to change where it walks, or it is not losing you.** An awake
body used to steer at your live position whatever it could sense, so one that
had lost you closed fifteen hundred units at a run, came back inside its own
notice and reset its own timer — it never lost anyone, because chasing is how
it found them again. A body that cannot hear you now goes to the last place it
could, and looks there.

Only bodies with a **bed** settle, and only `placeEnemy` gives one. The packs
the generator laid out are guarding a place and can be given the slip; the
horde that drips in during a run is hunting you and still is. Anchored things
and the avatars never settle — a boss you can walk away from and come back to
fresh is not a boss.

### The bestiary

`role` decides *how* a body fights, not how hard.

| | Life | Stride | Blow | Slag | Role — and what it is for |
|---|---|---|---|---|---|
| **Hollow-Thrall** | 34 | 96 | 8 | 1 | *press* — walks at you. The baseline everything else is read against. |
| **Eclipse-Kin** | 22 | 152 | 6 | 1 | *flank* — refuses the front. Arcs wide across open ground, funnels in a corridor. |
| **Iron-Breaker** | 135 | 62 | 21 | 4 | *anchor* — holds ground. Takes the narrowest cell near where it woke and braces on a readable rhythm: shielded and immovable, then open. `BRACE_SOAK` 0.26. |
| **Husk** | 40 | 112 | — | 1 | *burst* — does not strike. Closes, commits, and bursts; and bursts when it dies as well, so one broken across the room cost you nothing. `HUSK_FUSE` 0.52s. |
| **Cantor** | 28 | 78 | 12 | 1 | *shade* — never closes. Holds its range and throws, and **rock stops what it throws**: the first thing that makes a wall worth standing behind. |
| **Ashen Gorger** | 240 | 52 | 24 | 3 | *press* — slow enough that it never kills you; it decides *where the fight happens*. Its slam leaves the floor broken and burning. |
| **Flayer** | 46 | 172 | 9 | 1 | *stalk* — does not fight you, it visits. Crosses the room in one run, opens you up, and is gone before the blade comes round. The damage arrives afterwards: `BLEED_DPS` 7 over `BLEED_TIME` 3.2s. |
| **Shaman** | 74 | 58 | — | 2 | *chant* — a back rank that never closes and throws nothing you can dodge. It puts fire on the floor you are standing on, or takes the light away. The only answer is to reach it. |

Plus, arriving only with the avatar: **Lieutenant** (300 life, 26 blow, 12
slag) and **Mirage** (1 life, no blow, no slag).

### The ecosystem

Four behaviours that turn a horde into a system rather than a wall of meat:

- **Calcification.** A heavy body breaks off at `CALCIFY_AT` 30% of its life
  and armours over for `CALCIFY_TIME` 4s. Only a blow of `CALCIFY_BREAK` 12% of
  its max in **one hit** stops it — a scratch will not. You have to commit.
- **Totems.** A shaman plants one: 60 life, healing 9 a second to everything
  inside 180, for 22 seconds. The blade cuts it like anything else.
- **Consumption.** A champion standing over a fresh corpse within 90 units
  stops and feeds for 2.2s, returning 5.5% of its max a second — the only time
  a champion is holding still and not looking at you.
- **Champions.** `ELITE_CHANCE` 16% of packs are led by one, at `ELITE_HP` 2.6×
  life, and it never hands you rags.

---

## 7. The avatars

Two of them, and they ask opposite questions. Both arrive when the quota is
met, and the gate does not open until the one waiting for you is broken.

|  | **The Gilded Deceiver** | **The Crucible-Mass** |
|---|---|---|
| The question | *What are you hitting?* | *Where are you standing?* |
| Moves | blinks across the room | rooted, permanently |
| Held by | Lieutenants — he takes nothing while one stands | totems — it mends while one stands |
| Rungs | 37 of 52, and the whole teaching ramp | every third rung past the ramp |
| Epithets | seven, rolled per rung | none — it is one fight |

### The Gilded Deceiver

The avatar the hive-mind wears to be believed.

- **The Euphoric Tether.** While a Lieutenant stands he takes **nothing at
  all**. This used to be a 14% soak so the rule was one you could break — but a
  soak reads as a broken health bar and the player keeps hitting the wrong
  thing. *Immune* says it once. The bar says **HELD**, a pip counts each one
  standing, and the floater says TETHERED on the swing itself.
- **The False Dawn.** Every wound on an escort fills a crystal under the map.
  Killing them is how you reach him and how the clock runs down: one fact, one
  bar.
- **Metaphysical Nullification.** Break the crystal and he is stunned,
  silenced, and **Vulnerable** for 10s — where the Guillotine does ×5.
- **The Agony cleave.** His Lieutenants wind it together, and stand still while
  they do. An arc drawn by a body still walking lands where it was never drawn.

### His epithets

Rolled **per rung**, not per delve — a scheduled ambush is not an ambush, but a
boss you cannot learn is not a boss. His name is built from them and readable
at the gate-house before you descend.

*the Sundering* (his hand comes down where you stand) · *the Legion* (he does
not come with two, he comes with five) · *the Wreathed* (more of him is a lie
than usual) · *the Unblinking* (this one does not step away — it walks) · *the
Ravenous* (he eats what dies near him) · *the Riftborn* (the ground does not
close behind him) · *the Unbroken* (he gathers himself, and for a moment almost
nothing touches him)

### The Crucible-Mass

The second avatar, built almost entirely out of parts that already existed —
the breaker's bracing, the gorger's slam, the shaman's totems — and drawn as a
gorger at 45 units instead of 26, which is three times the footprint, tinted
hotter. No new art, no new systems.

- **The Anchor.** It never moves. The Anchoring Strike breaks its guard and
  lands its damage but cannot relocate it, and this is stated in `knock()`
  rather than left to fall out of a large mass — "it cannot be moved" is a
  rule of the encounter, not a consequence of a number someone may retune.
- **The Furnace.** Every ~5.4s it shatters **a ring, not a disc**: 7 blocks of
  96 units thrown at a radius of 250, each leaving the floor burning. A disc
  centred on something that cannot chase you says *stand further away*, which
  is not a fight, it is a wait. A ring says the floor at melee range is on
  fire and so is the floor at bow range, and **the gaps turn every cast**, so
  the safe arc is somewhere else each time.
- **The eye is clear of the fire and is not safe.** Measured: 25 seconds on
  the ring costs 224, in the eye costs 0 — and 682 if the boss is left
  switched on, because the eye is inside its reach. Neither the middle nor
  the edge is the answer.
- **The totem escort.** It calls shamans — up to three — who plant **on the
  ring**, inside the fire it is throwing, so the errand out to cut one goes
  through the hazard. Each standing totem mends it **9.5% of its own life a
  second**.

The mend rate is solved, not guessed. A Vanguard geared to a rung's own power,
standing in reach and swinging with the bar on cooldown, does this much of the
boss's pool per second:

| rung 8 | rung 26 | rung 50 |
|---|---|---|
| 11.3%/s | 16.6%/s | 24.7%/s |

So the window is above 24.7/3 = 8.2% and below 11.3%. At **9.5%** a single
totem is never enough to save it at any rung, and three out-mend the Vanguard
outright at the rung the fight is first met on. Cutting two of three is a win,
which matters — cutting all three while the ring is turning is not always on
offer.

> **At the deep end the escort is a drag, not a wall.** Sampling seven gear
> rolls rather than one, a rung-50 hero's damage against it runs **18–47%** of
> its pool a second, with the full escort's 28.5% sitting inside that spread.
> Whether three totems out-heal you at rung 50 depends on what your gear
> rolled.
>
> This is §11's valley showing up inside a single encounter: the boss's life
> scales at `(1 + d × 1.6)` and the hero's damage scales faster, so the escort
> is worth less every rung exactly as the horde is. It is **recorded rather
> than tuned away**, because no value of `CRUCIBLE_MEND` fixes it — lifting it
> far enough to beat a lucky deep hero puts a *single* totem above a shallow
> one, and the errand stops being finishable at the rung that teaches it.
> `tools/suites/crucible.js` asserts what is true and prints the spread.

### The uninvited

A rival Deceiver may **invade** a delve mid-run. Killing him does **not** open
the gate — the quota would stop meaning anything the moment one turned up — but
he was carrying something that was never his.

---

## 8. The delve itself

A 2000×2000 world on a 50×50 grid of 40-unit cells, cut fresh every descent.

**Generation:** a BSP split into leaves → one capped room per leaf → L-shaped
corridors three cells wide, braided into loops (dead ends are death when a
horde follows you) → a spawn pocket and a portal apron → the region's landmark
built at the gate → everything unreachable filled back in → chasms cut →
scenery, stains and lamps.

Rooms may sit **against the wall course**: rooms used to be kept two cells
inside their leaf on top of the one the split leaves, so every delve was cut
inside a three-cell dead border — 77% of the map, with 120 units of nothing on
every side. The floor now spans cells 1 to 48, and **52% of the grid is open**
against 44% before.

### Room types

`dressRooms` stamps three to five rooms with a shape you would recognise on the
way back:

- **hall** — pillars on a regular grid. The one shape that reads as *built*
  rather than eroded, and it gives a fight cover to break line of sight on.
- **barracks** — stub walls in rows, like bunk partitions off one side.
- **collapse** — a caved-in ceiling. A scatter of loose blocks, no pattern.
- **cistern** — left bare. A wide empty room is its own kind of place.

### Traps — ground the room keeps

A hazard is spent and gone; a trap is a permanent property of a place, and that
is what makes it terrain you can use rather than weather you endure.

- **Spikes**, in the pillared halls. Plates on a **checkerboard**, so half the
  floor is always safe and the room is a question about footing rather than a
  place you leave. `SPIKE_CYCLE` 3.4s: down, then a `SPIKE_TELL` 0.7s warning,
  then `SPIKE_OUT` 1.0s standing. They bite once per *rising*, not per frame.
- **Pools**, in the cisterns. `POOL_DPS` 11% of max life a second, continuous.

**They cut both ways** — a trap only the player can step in is a tax. The hero
pays `SPIKE_TOLL` 12% of their life where a body pays `SPIKE_BITE` 34% of its
own.

Three things the floor may **not** touch, each for its own reason:

- **Anything asleep.** `damageEnemy` wakes what it hits and the alert chains,
  so a field over a dormant pack roused it and then roused its neighbours —
  twenty-nine bodies awake while the player stood still at the spawn.
- **The avatar and his escort.** His fight has one rule — break the Lieutenants
  to reach him — and a trap under them breaks it for you.

> **On "forcing them in".** Measured: a plate is a 40-unit cell, and the
> Anchoring Strike moves a thrall **15 units**, a guard-break 21, an ordinary
> crescent 9, a breaker 5. So the play is not *shoving*, it is **leading** —
> you choose where to stand, the horde comes to you, and the floor is what it
> crosses to get there. That is positioning, which is the one tactical input
> these controls express.

### Reactive scenery

The player has a stick and an automatic blade, so the only tactical input they
have is *where* they fight — which is what this is for.

- **Pitch barrels** take a beat to go up after they are broken (`BARREL_FUSE`
  1.1s), so setting one off and then standing in it is your own fault rather
  than the auto-aim's. They leave the ground burning and chain to their
  neighbours.
- **Pillars** come down at once, because a column of stone does not hesitate,
  and crush what stood under them.

---

## 9. Loot

### Rarities

| | Affixes | Weight |
|---|---|---|
| Worn | 1 | 52 |
| Tempered | 2 | 28 |
| Spirit-wrought | 3 | 14 |
| Hallowed | 4 | 5 |
| **Riven** | 5 | 1 |
| *Mythic* | 5 | — never rolled; the Regalia only |

### Affixes

Ten ordinary ones — `damage`, `damage %`, `life`, `ward`, `stride`, `reach`,
`sweep`, `swing time`, `draw`, `regen` — each drawn from its slot's own pool,
so a blade rolls like a weapon and boots roll like boots. Four are
**hero-tagged** and pay half again in that Vanguard's hands.

### Brands — what a Riven piece *does*

Every ordinary affix moves one number one way, so the best item is the one with
the biggest numbers and there is nothing to decide. A brand moves **two against
each other**, and one of them changes how the blade behaves.

| Slot | Brand | |
|---|---|---|
| Blade | **Sundering** | three crescents in a **fan**, and half again the swing time |
| Blade | **Reaving** | crescents carry twice as far, and cut a third as wide |
| Boots | **Headlong** | a third again the stride, at a fifth of your life |
| Girdle | **Covetous** | triple draw, at a seventh of your life |

A brand **replaces** a rolled affix rather than adding a sixth line, so the
trade costs a slot as well as a stat. It rolls only on Riven, only in its own
slot, only one to a piece, and on `BRAND_ODDS` 55% of eligible Riven — a Riven
blade that is always branded is two items rather than a tier. **It survives the
temper**; everything else about the piece is rerolled.

> **Why the fan matters.** Extra crescents normally stagger behind the first
> down the same line — deliberately, since a spread reads as a shotgun. So +2
> shots at a slower swing would be a straight upgrade. A *fan* sends them wide
> and together, and that turns the numbers into a real trade: measured, one
> body takes **1.61 crescents a second before and 1.08 after**, while a crowd
> takes **1.61 before and 3.23 after**. Down a third against one thing, doubled
> against many.

### The Sundered Regalia

Eight mythic pieces — blade, off-hand, mail, girdle, boots, amulet, two rings —
with set bonuses at 2 (+18 life, +5% ward), 4 (+12% damage, +8% stride),
6 (+10% reach and sweep, +1 life a second) and **8 (a second crescent with
every strike)**.

Each region keeps the pieces that fell in it (see §1), weighted at
`RELIC_HERE` **70%** rather than locked — a region that only ever yields its
own makes the last slot hostage to one delve a player may not be able to beat,
and the reliquary's pity price is the valve for that. Every slot is claimed by
exactly one region, which is the invariant that keeps the set completable.

**You choose the ground.** A rung deep enough to reach the Rot-Weald is cut
from as many as five regions and the delve used to roll one, so "the rings are
in the Rot-Weald" was advice nobody could act on. The gate-house offers the
choice on any rung cut from more than one region, and names what each keeps.

### The fountain

Everything a coffer gives up leaves it **on a ring** — an angle each, evenly
spaced with a jitter, at 150–260 units a second. Evenly spaced rather than
randomly angled, because eight random angles cluster and a cluster is the heap
this replaces.

**Slag, not only coin.** Coin is banked the instant the lid comes up and is
therefore not a reason to walk anywhere; slag has to be picked up off the
floor, which is what makes a coffer somewhere you *go*. Four to seven lumps
from a coffer, nine to fourteen from a warded one.

Gear on the floor stands under a **beacon whose height and colour tell its
rarity** from across the room — 54 units for Worn up to 190 for a Regalia
piece.

---

## 10. Between delves

### The bag, the stash and the vault

`BAG_MAX` 20 in a delve. What you wear always comes home; the bag only if you
walked out. The vault holds `VAULT_MAX` 60, up to 120 with the Hall.

### Levels

`HERO_MAX_LEVEL` 60. Slag is experience, banked on the hero when the delve ends
— nothing interrupts a run to offer a card. The curve is
`38 × level^1.62`: deliberately shallow early and steep late, so the first
delves move and the fiftieth still means something. Each level is +6 life,
+1.15 ward and a little damage reduction, capped at 12%.

### The Vendor

Spends **coin**, which drops off bodies and out of coffers.

- **Commission a piece** — a Spirit-wrought item in a slot of your choosing.
  The gamble.
- **Temper a piece** — reroll every affix on something you are wearing, keeping
  its rarity. (And its brand.)
- **Open a reliquary** — a Regalia piece, priced **down** the longer one has
  refused to drop. The pity counter caps at 20.

### The Hall — four permanent tracks, three tiers each

| | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| **The Vault** | +20 vault, +1 preset (900) | +40, +2 (2600) | +60, +3 (6200) |
| **The Forge** | 12% off commissions and tempers (1100) | 24% (3000) | 36%, and +4 bag (7000) |
| **The Reliquary** | Regalia 15% more often (1400) | 30%, reliquaries 15% cheaper (3600) | 50%, 30% cheaper (8000) |
| **The Wardstone** | +10 life, +1.5% ward (1200) | +22, +3% (3200) | +38, +5% (7500) |

### Loadouts

Presets hold **item ids, not items**, so a saved kit degrades gracefully rather
than conjuring back a piece that was sold, tempered away or left in a delve.

---

## 11. The ladder

**52 rungs.** Depth `d` runs 0 to 1 across them, and everything scales off it:

| | |
|---|---|
| Expected power | `4 + 116 × d^0.6` |
| Slag quota | `125 + d × 145` |
| Regions in the pool | `1 + floor(d × 5)` |
| Enemy **health** | `× (1 + d × 1.6)` |
| Everything the delve hits you with | `× (1 + d × 1.6)` — see below |
| The avatar's health | `× (0.5 + d × 1.6)` |
| Which avatar waits | the Deceiver, except every third rung past the ramp |

### The teaching ramp

The first eight rungs each add exactly one archetype, with a line that says
what it is:

1. *Cut, gather, and find the ley-gate.*
2. *Some of them will not come at you down the middle.*
3. *Some ground is held. Some cannot be stood on.*
4. *Some of them are carrying it with them. Break those early.*
5. *Some of them never close at all. Put stone between you.*
6. *Something is waiting in the dark for your back to turn.*
7. *One of them breaks the floor it lands on. Do not be on it.*
8. *One of them fights from the back. Reach it or fight in its fire.*

The rung after the ramp is the whole game, and no champion, pitch, invasion or
epithet appears while it is still teaching.

### Difficulties

| | Threat | Loot | Regalia | |
|---|---|---|---|---|
| **Harrowed** | 1.00 | 0.85 | 0.6 | A delve you can learn on. |
| **Riven** | 1.42 | 1.00 | 1.0 | The Rivenmark as it is. Roughly one delve in three ends at the gate. |
| **Sundered** | 1.95 | 1.35 | 1.8 | Champions in every hall. The Regalia surfaces here. |

### The curve, and how it was straightened

The ladder used to be a valley, and it is worth writing down what that was
because the cause turned out to be one mistake made four times.

The reference player's extraction rate and **pressure** — life lost per minute
alive, against the hero who belongs on that rung:

| | rung 0 | 3 | 9 | 17 | 30 | 44 | overall |
|---|---|---|---|---|---|---|---|
| **was** | 4/16 | 0/16 | 0/16 | 0/16 | 8/16 | 12/16 | 25% |
| **is** | 17/24 | 3/24 | 1/24 | 3/24 | 11/24 | 15/24 | **35%** |
| pressure was | 1.58 | 1.91 | 2.36 | 1.89 | 0.99 | **0.54** | |
| pressure is | 1.33 | 1.67 | 1.67 | 1.11 | 0.92 | **0.94** | |

It cleared the teaching rungs, hit a wall the moment the ramp ended, then got
steadily **easier** all the way down — the deepest delve in the game was the
safest one in it.

**Four things were wrong, and all four were the same thing:** something the
delve throws did not scale with the ladder while the hero did.

1. **The horde's damage was flat** across all 52 rungs while its health was
   multiplied by depth. Fixed by `delveBite`, applied at the single door every
   point of damage comes through — because *"the delve itself"* (hazards,
   bursts, broken ground) was 45–64% of what actually killed the reference
   player, so a term on enemy damage alone would have moved less than half of
   it.
2. **The avatar did not scale at all** — 540 life at the proving ground and 540
   at the fifty-second rung. Rung 0 met its quota 19 times in 24 and got out
   *none*: gathering was never its problem, he was.
3. **A blast had no falloff for the hero.** A body took 0.4–1.0 of it by
   distance; the hero took a flat 0.4 anywhere inside the radius, so the edge
   of a pitch barrel cost what the middle did and stepping back was worth
   nothing. Bursts were **52%** of everything that killed the bot at rung 3.
4. **The rung's own advice was wrong**, and this is what made rungs 3–17 look
   like a wall. `power` is what the gate-house recommends by, and it was linear
   when the content is not:

   | rung | card said | actually took | wrong by |
   |---|---|---|---|
   | 3 | 10 | 30 | **3.0×** |
   | 9 | 21 | 42 | 2.0× |
   | 17 | 36 | 57–72 | ~1.8× |
   | 30 | 60 | 90 | 1.5× |
   | 44 | 87 | 87–110 | ~1.1× |

   The game was sending people into delves it had told them they were ready
   for. `d^0.6` fits every measured point and still starts at 4, so a Vanguard
   who has never descended still qualifies for the proving ground.

> **On `ward`.** Scaling incoming damage was avoided for a long time on the
> belief that it would make ward worth less every rung. It does not: ward is
> applied as `(1 - ward)`, a **share** of the blow, and 12% of a bigger number
> is still 12%. The comment above that line called it "flat damage reduction",
> and that reading is what stalled the fix for so long.

`tools/suites/winnable.js` now guards this on **pressure** rather than win
rate — a continuous measure over thousands of blows rather than a binary over
two dozen delves — and fails if the deep end goes soft again.

### What a deep delve buys with its depth

Beyond the damage term above, three *environmental* terms scale with `d` — they
tax **position**, which is the input the controls actually have, rather than
the health bar, which the gear already answers:

| | at rung 0 | at rung 51 |
|---|---|---|
| `ALERT_GROWTH` — how far a woken body carries the alarm | 155 units | 240 |
| `AFFLICT_GROWTH` — how long a bleed, ember or broken floor lasts | ×1 | ×2 |
| the spike beat — and the rest between risings | 3.4s / 1.7s | 2.6s / 0.9s |

The spike's **tell (0.7s) and standing (1.0s) never move**: they are the part
the player reads and dodges, and every second the beat loses comes out of the
rest. `tools/suites/traps.js` fails if that stops being true, and holds the
rest above the time it takes to cross a plate — a hall you cannot cross is a
wall, not a harder hall.

The alert chain is the one that measures dramatically: at rung 44 a roused pack
brings **46 bodies at once against 12** without it — four times the horde, and
the whole of `HORDE_LIVE`. Ablated and guarded in `tools/suites/packs.js`.

> **These three were built first, on their own, and moved the extraction rate
> by nothing** — 24/96 to 26/96, when rung 0, which has no depth and therefore
> no lever on it at all, swung 4/16 to 7/16 by itself.
>
> That was the finding that led to the fix above: quadrupling the horde at the
> deepest rung does not make the deepest rung harder. What was broken was not
> how *many* chances the delve got to hurt you, it was how *big* each one was.
> **Any lever that adds occurrences is dead on arrival against a flat number.**
> They are kept because they are good for the *character* of a deep delve —
> a pack that comes as two packs, a wound that outlives the fight — but the
> arithmetic is `delveBite`'s job.

> **A trap they set for each other.** `AFFLICT_GROWTH` doubles a hazard's
> lifetime and `delveBite` doubles its damage, so together they quadrupled it,
> and burning ground became the single largest killer in the game at 45% of
> everything that reached the hero at rung 44. Anything lingered is now marked
> `sized` and excused the damage term — it has been made worse by depth once
> already.

---

## 12. Hardcore

One life. Everything the Vanguard owns goes with them.

**Three localStorage keys, and each has a reason.**

- The Hardcore stash is a **second key**, not a flag inside the first, because
  the death hook wipes it — and a wipe that reaches into a shared record to
  remove exactly the right half is one that will eventually take the wrong
  half. Pointing both modes at one key makes the ordinary game come back
  **0 pieces and 0 coin** after a Hardcore death. That is the disaster the two
  keys prevent, by construction rather than by care.
- **The mode flag** cannot live in the stash either — it decides *which* stash
  to load, so it is read at boot, before it. A player who closed the app inside
  a Hardcore life must not come back to their softcore kit and find out which
  mode they were in by dying in the wrong one.
- **The honours** are a third key because they have to survive the wipe.

**The death** starts again from `blankStash` rather than clearing a list of
fields it knows about — written any other way, a field somebody adds next year
quietly survives death. Gear, vault, coin, ranks and pity all go. No corpse is
written: there is nobody left to come back for it. It runs *after* banking, so
the last delve is still scored before it is taken away.

**The reward:** `HC_LOOT` **1.5×** on both loot and Regalia.

**The trophy:** carry a whole eight-piece Regalia out of one life and the
crescent answers in **crimson** for ever, in either mode. Checked against worn
pieces *plus* the bag, since a set is only finished when the last piece is out
of the ground.

---

## 13. Daily bounties

One delve a day, named in advance, on ground that has been changed.

| | |
|---|---|
| **The Quickening** | everything a quarter faster, and a third more slag in them |
| **The Hoard** | twice the coffers, and half the coin off a body |
| **The Brittle Host** | a quarter less life in them, a quarter more in their blows |
| **The Teeming** | half again as many, each one worth less |

Each is a **trade**, not a difficulty setting — a bounty that is only harder is
a chore with a prize on it.

Both the twist and the rung fall out of the **calendar date**, so nothing has
to be synchronised and the only stored state is whether you have taken it. Two
different mixes of the same number, or the twist and the rung would march up
the ladder in lockstep; and the rung is drawn from the shallow half, because a
daily nobody can reach is a daily nobody runs. The date is built from the local
Y/M/D so it does not slide by an hour twice a year.

Whether the bounty is live is decided from the LEVEL, not trusted from the
menu: an armed flag left over from yesterday, or from a different rung, must
not quietly twist a delve it was not for.

**It pays on the way out** — a guaranteed **Hallowed** piece, once a day. A
full vault **holds** the bounty rather than burning it; stamping the claim and
then finding nowhere to put the piece spends the day for nothing, with no way
for the player to know that is what happened.

---

## 14. Controls and UI

**One thumb.** A floating stick anywhere on the left, the Conduit and the kit
bottom-right, WASD and arrows on a desktop. A touch on a button is consumed by
that button and never reaches the stick.

### The Conduit — where the attack lives

The blade used to swing itself: an auto-target, a timer, and no input at all.
That is the whole of why the attack felt meaningless — the blow was not weak,
nobody threw it. The Conduit is one control with three states, told apart by
how it is touched, and it is the biggest thing on the screen because it is
what the game is about.

| | | |
|---|---|---|
| **Tap** | under 0.2s, never dragged | The accessible swing — nearest body, no aiming, one thumb. Tap again inside the window and it **chains**: the third of three comes round a fifth wider. |
| **Drag** | past the deadzone | The drag vector takes the aim off the auto-target entirely. The blade fires down that line on its own beat for as long as you hold it — back-pedalling while cutting into a doorway is a thing you can express now. |
| **Hold at the rim** | 0.45s and out at the edge | The firing stops and the blade gathers, at **half stride** while it does. Let go and it comes round once: ×3.4 damage, ×2.1 wide, ×1.6 reach. |

**The blade does not swing when the Conduit is idle.** It used to, and that
was the last thing making the attack optional; see *The swing, and what it is
worth* above for the two measurements that took it out. A one-thumb player
still has the whole game — the tap finds its own target and needs no aiming —
but it is a press, not a default. What driving it buys beyond that is *aim*,
the *chain* and the *cleave*.

The chain's window is the blade's own beat (`fireDelay × 1.6`, so 0.99s for
Isaac) and **not** `GCD_TIME`. The ability beat is 1.2s against a swing rate of
0.62, and a window that wide would make the chain a formality rather than a
rhythm. Tied to the blade instead, the Quickening boon and a Quick
affix speed the chain up too, which is what anyone would expect them to do.

The state machine lives in the **core**, not in either host: both builds drive
it through `conduitPress` / `conduitAim` / `conduitRelease`, and the suites
drive it with no pointer at all.

- **Top strip** — one band: life with quarter ticks and a low-life pulse, and
  the slag count against the quota.
- **Boss bar** — under it, with the map dropping by its height so the two never
  stack. **HELD** sits in the name line beside the count, with a red pip for
  each Lieutenant standing.
- **The map** — top-right, tucked under the strip. The bottom corners are where
  thumbs live.
- **The banner** — anchored *under the map*, which is the one band on a phone
  screen that is neither chrome nor the fight.
- **The kit** — two rows of three, each a plate: a bronze band, a slate face
  lit from the north-west. A cooldown is a **wedge draining clockwise** with
  the ability's mark kept — a number replacing the mark takes away the one
  thing that says *which* ability this is at exactly the moment you are waiting
  for it. Blocked loses the bronze as well as the colour: no amount of waiting
  fixes it.
- **Hold** — top-left, the one corner a hand does not visit. Press on, or
  abandon the delve (which banks nothing — that is what makes it abandoning).

---

## 15. Art

**Every sprite is drawn from paths in code.** No image assets ship in the
bundle; `tools/export-art.js` writes `art/` at 2× from the same forge, and
`phaser/tools/pack-atlas.js` packs it into one atlas.

- **One light**, everywhere: `LIGHT = { x: 0.62, y: 0.78 }` — walls throw 11,
  bodies 5. Every plate, blade and body is lit from the same north-west.
- **A gait driven by distance travelled**, not by a timer, so a body that is
  pushed does not moonwalk. Eight poses; `GAIT_STEP` 21 at a run, `WALK_STEP`
  13 at a walk.
- **A breath at draw time** — a horizontal scale quantised to 64ms, phased per
  body so a pack does not breathe in unison and read as one machine. Forged
  idle poses cost 3.95MB and, being a sine on one parameter, held only three
  distinct shapes in six frames.
- **A death that topples** and pivots on the feet.
- **A light pass** at forge time: a lit edge and a material sheen, so bodies
  read as objects in a room rather than as flat stamps.

---

## 16. Two builds, one game

**The Phaser build in `phaser/` is the game.** It is what the APK carries, what
is deployed, and the only build whose look is maintained.

| | `index.html` (canvas) | `phaser/` |
|---|---|---|
| What it is | the simulation's source of truth | the game |
| Ships | no | APK and web |
| Runs from `file://` | yes, no build step | no — `npm run serve` |
| On an Adreno 840 | 20fps, effects already shed | a locked 60 |
| Its UI | frozen | maintained |

Every line of simulation lives in `index.html` and is lifted out **whole** by
`phaser/tools/extract-core.js` into `phaser/src/core/core.js`; `npm run verify`
then runs the same suites against both and proves they agree. Change how the
game *behaves* in the canvas build. Change how it *looks* in `phaser/src`.

The extractor refuses a core with a hole in it — it has twice caught logic
being silently dropped into the host, including a Hardcore death that would
never have wiped anything in the build that actually ships.

### Performance

Measured on a Galaxy S26 Ultra, Adreno 840, in the APK at 1080×2340, 130
bodies, full atmosphere:

```
fps 60   p90/p99 16.7 / 16.8ms   worst 16.8ms   over 20ms: 0% of frames
effects  full   governor: 0 drops, 0 restores   work 4.76ms/frame
bake     5ms one-off per delve
```

The canvas build on the same device: **20fps, worst 118ms, 99% of frames over
budget, and its effects already shed.**

An **FX governor** watches the frame and sheds the atmosphere before the frame
rate goes — it has never fired on this hardware, which is the point of it. A
**layer profiler** in the diagnostics dump says where a frame went.

### The safety net

**36 canvas suites / ~959 checks**, and **13 Phaser suites**. The discipline
they are written to:

- Measure, do not guess. Ablate. Revert-prove.
- Percentiles, not means — a mean hides the stutter a hand feels.
- **A fixture that finds nothing must FAIL**, loudly, rather than pass on an
  empty sample. Every check that can be vacuous carries its own control.

`winnable.js` is the instrument for balance: a reference player with its own
pathfinder plays ninety-six whole delves and reports where the damage came
from and how often the gate was reached. It is an instrument, not a tripwire —
the bot does not kite and does not use terrain, so the rate is its own. Run it
either side of a change and the difference *is* the change.

---

## 17. Not built yet

- **Ad monetization** — rewarded video on death and extraction, native shrines,
  capped interstitials. Not game code: an SDK in the Android shell, a
  JS-to-native bridge, and a consent flow (UMP/GDPR, and Play's families policy
  if the app is ever family-designated). Needs the network chosen first.
- **A gentle dip at rungs 3–17.** The valley in §11 is closed — no rung is a
  wall and the pressure curve is roughly flat — but the middle of the ladder
  still runs harder than either end. Worth knowing before chasing it: the two
  biggest killers in the game are **bursts and burning ground** (55% of
  everything that reaches the hero), and the reference player is by
  construction bad at exactly those — it "does not use the terrain" — so its
  rate at hazard-heavy rungs understates a person's.
- **A third boss.** Two are built (§7). Every rung names one, and a rung whose
  boss is unknown simply opens its gate on quota.
