How's My WiFi
=============

Measure (repeatedly) your broadband speed using Fast.com in a headless browser.

Yes, WiFi isn't broadband and broadband isn't WiFi but ultimately, what
is the speed you get on [Fast.com](https://fast.com)? That's the speed
of your connection to the Interwebs. The WiFi from your laptop to your
router is unlikely to be the bottleneck so this ultimately measures your
broadband.

This is a NodeJS script that opens [Fast.com](https://fast.com), written
by Netflix, with a headless browser, hangs on till it gets a
speed measurement. Then it records this number in a local database.

You run it like this (if you installed it globally):

    howsmywifi

Running it once is about as useful as opening a browser tab to https://fast.com.
To really get your money's worth, loop it like this:

    howsmywifi --loop

...then wait. Let it run for a couple of minutes and bask in the glorious
line chart that indicates your Internet Flash Gordonness.

The goal is to comprehend how your Internet speed is fluctuating.
Perhaps Comcast is telling, for $100 a month you get "Up to 75Gbps"
but what good is that if it turns out it hovers around 0.5Gbps most of
the time?

How Does It Work
----------------

It uses [puppeteer](https://github.com/GoogleChrome/puppeteer) to open
`https://fast.com` in a headless Chrome browser. It then waits until
that app has managed to calculate your Internet speed. If it takes
longer than 30 seconds, it'll error out with a timeout.

If you run it with the `--loop` flag, it'll repeatedly do this operation
over and over with some sleep in between (default is 5 min) and
print out a graph with a moving average on it.

All speed measurements are recorded in a local `sqlite3` file. This is
useful for getting historical insights.


How To Install It
-----------------

With `npm`:

    npm install howsmywifi

With `yarn`:

    yarn add howsmywifi

Or, globally, with `npm`:

    npm install -g howsmywifi

Or, globally, with `yarn` (recommanded):

    yarn global add howsmywifi


How To Run It
-------------

Basic operation is:

    ./node_modules/.bin/howsmywifi

That will give you, after a couple of seconds, a speed value.
The more interesting thing is to run it repeatedly so a moving average
can tell you what your speed is:

    ./node_modules/.bin/howsmywifi --loop

Check out the other options with:

    ./node_modules/.bin/howsmywifi --help


What Does It Look Like?
-----------------------

Like this:

![Screenshot](screenshot.png)

Yeah, it ain't pretty. Neither is the code, but it's a start.

LICENSE
-------

MIT.
