How's My WiFi
=============

**HIGHLY EXPERIMENTAL BUT ALSO TOTALLY HARMLESS**

Measure (repeatedly) your broadband speed using Fast.com in a headless browser.

Yes, WiFi isn't broadband and broadband isn't WiFi but ultimately, what
is the speed you get on [Fast.com](https://fast.com)? That's the speed
of your connection to the Interwebs. The WiFi from your laptop to your
router is unlikely to be the bottleneck so this ultimately measures your
broadband.

This is a NodeJS script that opens `https://fast.com` with a headless
browser, hangs on till it gets a speed measurement. Then it records this
number in a database.

You run it like this:

    node index.js

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

Or, globally, with `yarn`:

    yarn global add howsmywifi


How To Run It
-------------

Basic operation is:

    ./node_modules/.bin/howsmywifi

That will give you, after a couple of seconds, a speed value


What Does It Look Like?
-----------------------

Like this:

![Screenshot](screenshot.png)

Yeah, it ain't pretty. Neither is the code, but it's a start.

LICENSE
-------

MIT.
