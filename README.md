Solar Sailor
===

My entry for Ludum Dare #23. The theme was Tiny World and this is what I came up with.


Controls
---

Player one uses the WSAD keys to control their acceleration:
- 'W' accelerates up.
- 'S' accelerates down.
- 'A' accelerates left.
- 'D' accelerates right.

Player two uses the IKJL keys.


Objective
---

It's a race! Cross the finish line first to win. Try not to collide with any
obstacles or other racers, or you'll take damage... and no-one wants to see a
whole planet crumble to dust.


Tips
---

Everything has a gravitational field, so if you get too close it might pull you
off course. But you can also use this to your advantage, to turn corners more
sharply without losing as much speed.


System requirements
---

This game uses WebGL and a little bit of HTML 5, so it needs a reasonably
up-to-date web browser. I've tested successfully on the following:

OS X:
- Chrome 18
- Firefox 11
- Safari 5.1

Windows:
- Chrome 18
- Firefox 11

Linux:
- Chrome 18
- Firefox 11

If you're using Chrome, Firefox or Safari and you've been letting the automatic
update do its thing, then you should have a browser capable of running the game.

*Internet Explorer users:* As of IE 9, IE still doesn't support WebGL yet so the
game won't work on that.

*Safari users*: Safari has WebGL support but you have to explicitly enable it.
It's an option in the _Develop_ menu. If you can't see the _Develop_ menu,
you'll need to enable it too: go into Safari's preferences, go to the _Advanced_
tab and tick the box which says "Show Develop menu in tool bar".


Acknowledgements
---

This game relies on some great open source JavaScript libraries from some very generous people:

- Brandon Jones’ gl-matrix: https://github.com/toji/gl-matrix
  I have my own fork which adds vec2 operations: https://github.com/vilya/gl-matrix
- David Bau’s seedable random function: http://davidbau.com/archives/2010/01/30/random_seeds_coded_hints_and_quintillions.html
- The Khronos Group’s webgl-utils.js: https://cvs.khronos.org/svn/repos/registry/trunk/public/webgl/sdk/demos/common/webgl-utils.js

