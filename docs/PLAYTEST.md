# Playtesting The Rivenmark

A short guide for anyone trying the debug build on an Android phone. It takes
about ten minutes to set up. A useful session is 20–40 minutes of play.

## 1. Get the APK

The **Debug APK** workflow builds the app on every pull request and every push
to `main`.

1. On GitHub, open the repository's **Actions** tab, then **Debug APK**.
2. Open the most recent green run for the branch you want to test.
3. At the bottom of the run's Summary page, under **Artifacts**, download
   **the-rivenmark-debug-apk**. It is a `.zip` file.
4. Unzip it. Inside is `app-debug.apk`.

## 2. Install it on the phone

1. Send `app-debug.apk` to the phone, by email, Drive, a cable or anything else.
2. Tap the file on the phone. Android will ask for permission to install apps
   from that source (Files, Chrome, Gmail and so on). Allow it for this one
   install.
3. If an older debug build is already installed and the install fails,
   uninstall the old one first. **Doing that deletes its saves.**

It is a debug build. Play Protect may warn that it is from an unknown
developer. That's expected.

## 3. What to play

- **The first delve.** Start fresh. The tutorial should walk you through
  walking, striking, aiming, the heavy blow, an ability and getting out. Each
  step moves on only once you've done the thing.
- **The practice room.** It's the *Practice room* button in the gate-house. Nothing
  there is saved or lost, so use it to try the controls freely.
- **The first ten or so delves.** This is where most people will spend their time, and where
  the difficulty was retuned.
- **Settings (⚙).** Try the controls switch. *New* is the default; *Classic*
  is the old scheme, kept so the two can be compared.
- Anyone who gets deep: the delve named *The Silent Choir* is where the third
  boss first appears, and the last delve on the ladder ends the game. The
  ladder stays open after that.

## 4. What we most want to know

The feedback that started this work was *"it's not fluid, it feels off and
frustrating"*. So above everything else:

1. **Does striking feel responsive now?** Holding the Conduit strikes for as
   long as you hold it. Does a blow ever fail to come out when you expected
   one? Does one come out when you didn't want it?
2. **The heavy button.** Is it where your thumb expects it? Is a full gather
   easy to tell apart from a half one?
3. **Aim.** When you don't aim by hand, does it pick the enemy you meant?
4. **New vs Classic.** If you try both, which do you prefer, and why?
5. **Difficulty.** Where did you die, and did it feel fair? Could you see it
   coming?
6. **Sound and vibration.** Is anything too loud, too quiet, missing or
   annoying?
7. **Anything confusing**, such as a screen, a word, or a rule the game never
   explained.

## 5. Sending a report

Short notes are fine. For each one, please include:

- the phone model
- the delve's name, the hero, and New or Classic controls
- what happened, and what you expected to happen

**For anything about performance or a stutter**, send the diagnostics as well.
During a delve, tap the small **◔** dot in the top-right corner, then **copy
diagnostics**, and paste the text into your message. It records frame times,
the effects level and recent inputs. That's what makes a "it felt off" report
something we can fix.

## 6. Known rough edges

- The Silent Choir and the ending are new and less tested than the
  rest.
- Saves live in the app's storage. Uninstalling the app wipes them.
