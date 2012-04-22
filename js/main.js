var SolarSailor = function () {  // start of the SolarSailor namespace

//
// Global variables
//

// Wrapper for all WebGL functions and constants.
var gl;

// The 2D canvas context we use for background rendering of text.
var tl;

// Wrapper for all our globals
var game = {
  'viewportWidth': -1,
  'viewportHeight': -1,

  'projectionMatrix': mat4.ortho(0.0, 1.0, 0.0, 1.0, 10.0, -10.0),
  'cameraMatrix': mat4.translate(mat4.identity(), [0.0, 0.0, 5.0]),
  'targetDistance': 5.0,

  'quadBuf': null,
  'circleBuf': null,
  'racerPosBuf': null,
  'racerColorBuf': null,
  'racerRadiusBuf': null,
  'racerDestBuf': null,
  'obstaclePosBuf': null,
  'obstacleColorBuf': null,
  'obstacleRadiusBuf': null,
  'waypointPosBuf': null,

  'framebuffers': [],
  'frameTextures': [],
  'textTexture': null,
  'titleTexture': null,

  'drawShader': null,
  'waypointShader': null,
  'postprocessShader': null,
  'textShader': null,
  
  'edgeKernel': null,
  'blurKernel': null,
  'postprocessUVOffsets': null,

  // Racers
  'numRacers': 0,
  'racerPos': [],           // x,y values for each racer.
  'racerVel': [],           // x,y values for each racer
  'racerAccel': [],         // x,y values for each racer
  'racerRadius': [],        // single float for each racer
  'racerMass': [],          // single float for each racer
  'racerNextWaypoint': [],  // single int for each racer
  'racerDest': [],       // a pair of x,y values (i.e. 4 values) for each racer.
  'racerColor': [],         // r,g,b,a values for each racer. TODO: replace with texture IDs.
  'racerName': [],          // single string for each racer
  'racerTopSpeed': [],      // single float for each racer
  'racerTopAccel': [],      // single float for each racer
  'racerIsHuman': [],       // single bool for each racer
  'racerKeyMap': [],        // single string for each racer. Gives the keys, in order, for: up, down, left, right (e.g. "WSAD" for standard keys).

  // Obstacles
  'numObstacles': 0,
  'obstaclePos': [],
  'obstacleRadius': [],
  'obstacleMass': [],
  'obstacleColor': [],

  // Waypoints
  'numWaypoints': 0,
  'waypointPos': [],        // A pair of x,y coordinates (i.e. 4 values) for each waypoint.
  'waypointCenter': [],     // x,y values for each waypoint.

  'lastUpdate': 0,          // Time we last called game.update().
  'lastStateChange': 0,     // Time we last switched into a new state.
  'gameStates': {
    'titles':     { 'draw': drawTitles,     'update': updateTitles },
    'gameSetup':  { 'draw': drawGameSetup,  'update': updateGameSetup,  'begin': beginGameSetup },
    'countdown':  { 'draw': drawCountdown,  'update': updateCountdown },
    'playing':    { 'draw': drawPlaying,    'update': updatePlaying },
    'win':        { 'draw': drawWin,        'update': updateWin },
    'lose':       { 'draw': drawLose,       'update': updateLose },
    'tie':        { 'draw': drawTie,        'update': updateTie },
    'paused':     { 'draw': drawPaused,     'update': updatePaused },
  },
  'currentGameState': null,

  'keysDown': {},
};


//
// Constants
//

var kG = 66.72; // Newton's gravitational constant, G. Or a variant thereof :-)


//
// Functions
//

function shader(id)
{
  var elem = document.getElementById(id);
  var type = { "x-shader/x-fragment": gl.FRAGMENT_SHADER,
               "x-shader/x-vertex": gl.VERTEX_SHADER }[elem.type];
  var text = document.getElementById(id).textContent;
  var obj = gl.createShader(type);
  gl.shaderSource(obj, text);
  gl.compileShader(obj);
  if (!gl.getShaderParameter(obj, gl.COMPILE_STATUS))
    throw new Error(id + " shader compilation failed:\n" + gl.getShaderInfoLog(obj));
  return obj;
}


function program(vertShaderID, fragShaderID, uniforms, attribs)
{
  var vertShader = shader(vertShaderID);
  var fragShader = shader(fragShaderID);

  var prog = gl.createProgram();
  gl.attachShader(prog, vertShader);
  gl.attachShader(prog, fragShader);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error("Shader linking failed:\n" + gl.getProgramInfoLog(prog));

  gl.useProgram(prog);

  prog.uniforms = {}
  for (var i = 0; i < uniforms.length; i++)
    prog.uniforms[uniforms[i]] = gl.getUniformLocation(prog, uniforms[i]);

  prog.attribs = {};
  for (var i = 0; i < attribs.length; i++)
    prog.attribs[attribs[i]] = gl.getAttribLocation(prog, attribs[i]);

  prog.enableAttribs = function () {
    for (var a in this.attribs)
      gl.enableVertexAttribArray(this.attribs[a]);
  };

  prog.disableAttribs = function () {
    for (var a in this.attribs)
      gl.disableVertexAttribArray(this.attribs[a]);
  }

  return prog;
}


function texture(textureURL)
{
  var tex = gl.createTexture();
  tex.isLoaded = false;
  tex.image = new Image();
  tex.image.onload = function () {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tex.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    tex.isLoaded = true;
  };
  tex.image.src = textureURL;
  return tex;
}


function addFramebuffer()
{
  // Create the intermediate rendering buffers & textures.
  var fb = gl.createFramebuffer();
  var tex = gl.createTexture(); // creating a texture to use as a render target.
  var depth = gl.createRenderbuffer(); // create a depth buffer to use with the render target.
  game.framebuffers.push(fb);
  game.frameTextures.push(tex);

  // Set up the target texture.
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, game.viewportWidth, game.viewportHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  // Set up the depth buffer.
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, game.viewportWidth, game.viewportHeight);

  // Bind them to the framebuffer.
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);

  // Clean up.
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}


function text(x, y, size, message)
{
  tl.font = size + "px Tahoma";

  tl.clearRect(0, 0, tl.canvas.width, tl.canvas.height);
  tl.fillText(message, 0, 0);

  var tlx_to_vpx = tl.canvas.width / game.viewportWidth;
  var tly_to_vpy = tl.canvas.height / game.viewportHeight;

  var textSize = tl.measureText(message);
  var tw = textSize.width / tl.canvas.width;
  var th = size / tl.canvas.height;
  var tx = x - tw * tlx_to_vpx / 2.0;
  var ty = y + th * tly_to_vpy / 2.0;

  var transform;
  if (game.cameraMatrix) {
    transform = mat4.identity();
    mat4.inverse(game.cameraMatrix, transform);
    mat4.multiply(game.projectionMatrix, transform, transform);
  }
  else {
    transform = game.projectionMatrix;
  }
  mat4.translate(transform, [tx, ty, -1.0]);
  mat4.scale(transform, [tlx_to_vpx, tly_to_vpy, 1.0]);
  
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, game.textTexture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tl.canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(game.textShader);
  game.textShader.enableAttribs();
  gl.uniformMatrix4fv(game.textShader.uniforms['worldToViewportMatrix'], false, transform);
  gl.uniform1i(game.textShader.uniforms['tex'], 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.quadBuf);
  gl.vertexAttribPointer(game.textShader.attribs['pos'], 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(game.textShader.attribs['uv'], 2, gl.FLOAT, false, 16, 8);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  game.textShader.disableAttribs();
}


function edgeKernel()
{
  var kernel = new Float32Array([
    0.0,  0.0, -1.0,  0.0,  0.0,
    0.0, -1.0, -2.0, -1.0,  0.0,
   -1.0, -2.0, 16.0, -2.0, -1.0,
    0.0, -1.0, -2.0, -1.0,  0.0,
    0.0,  0.0, -1.0,  0.0,  0.0,
  ]);
  return kernel;
}


function blurKernel() {
  var sigma = 1.0;
  var W = 5;
  var kernel = [];
  var mean = W / 2.0;

  for (var x = 0; x < W; x++) {
    for (var y = 0; y < W; y++) {
      var val = Math.exp( -0.5 * (Math.pow((x-mean)/sigma, 2.0) + Math.pow((y-mean)/sigma, 2.0)) )
                / (2 * Math.PI * sigma * sigma);
      kernel.push(val);
    }
  }
  return kernel;
}


function init(drawCanvas, textCanvas)
{
  // Initialise the random number generator.
  Math.seedrandom('SolarSailor');

  // Set up the drawing canvas.
  gl = WebGLUtils.setupWebGL(drawCanvas);
  if (!gl)
    return;

  // Set up a canvas to use as an intermediate texture for text rendering.
  tl = textCanvas.getContext('2d');
  tl.fillStyle = "#AAAACC";   // The text colour, can take a hex or rgba value (e.g. rgba(255,0,0,0.5))
  tl.textAlign = "left";      // Text alignment, e.g. left, center, right
  tl.textBaseline = "top";	  // Baseline of the text, e.g. top, middle, bottom
  tl.font = "48px monospace";	// Size of the text and the font family used

  // Set up some OpenGL state.
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.cullFace(gl.BACK);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.depthFunc(gl.LEQUAL);

  // Set the viewport dimensions.
  game.viewportWidth = drawCanvas.width;
  game.viewportHeight = drawCanvas.height;

  // Create the vertex buffers.
  game.quadBuf = gl.createBuffer();
  game.circleBuf = gl.createBuffer();
  game.racerPosBuf = gl.createBuffer();
  game.racerRadiusBuf = gl.createBuffer();
  game.racerColorBuf = gl.createBuffer();
  game.racerDestBuf = gl.createBuffer();
  game.obstaclePosBuf = gl.createBuffer();
  game.obstacleRadiusBuf = gl.createBuffer();
  game.obstacleColorBuf = gl.createBuffer();
  game.waypointPosBuf = gl.createBuffer();
  game.waypointCenterBuf = gl.createBuffer();
  var square = new Float32Array([
    // x, y       u, v
    0.0, 0.0,   0.0, 0.0,
    1.0, 0.0,   1.0, 0.0,
    0.0, 1.0,   0.0, 1.0,
    1.0, 1.0,   1.0, 1.0
  ]);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, square, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Create the intermediate rendering buffers & textures. Note that we don't
  // create the framebuffers yet - they're expensive, so we defer that until
  // postprocessing is switched on.
  game.textTexture = gl.createTexture();
  game.titleTexture = texture("img/TitleScreen.png");

  // Set up the shaders
  game.drawShader = program("draw-vs", "draw-fs",
      [ "worldToViewportMatrix", "color" ], // uniforms
      [ "pos", "color", "radius" ] );       // attributes
  game.waypointShader = program("waypoint-vs", "waypoint-fs",
      [ "worldToViewportMatrix", "color" ], // uniforms
      [ "pos" ] );                          // attributes
  game.postprocessShader = program("postprocess-vs", "postprocess-fs",
      [ "worldToViewportMatrix", "tex", "kernel", "uvOffset" ], // uniforms
      [ "pos", "uv" ] );                                        // attributes
  game.textShader = program("text-vs", "text-fs",
      [ "worldToViewportMatrix", "tex" ], // uniforms
      [ "pos", "uv" ] );                  // attributes

  // Set up the parameters for our post-processing step.
  game.edgeKernel = edgeKernel();
  game.blurKernel = blurKernel();
  var u = 1.0 / game.viewportWidth;
  var v = 1.0 / game.viewportHeight;
  var uvOffset = [];
  for (var r = -2; r <= 2; r++) {
    for (var c = -2; c <= 2; c++)
      uvOffset.push(r * v, c * u);
  }
  game.postprocessUVOffsets = new Float32Array(uvOffset);

  // Set up the racer data.
  game.numRacers = 4;
  for (var i = 0; i < game.numRacers; i++) {
    var radius = Math.random() * 5.0 + 2.5;
    var volume = Math.PI * Math.pow( (radius / game.viewportHeight), 2.0);
    var density = Math.random() + 5.0; // Units: grammes per cubic centimetre -> g/cm^3. Earth is 5.52 g/cm^3

    game.racerPos.push(Math.random(), Math.random());
    game.racerVel.push(0.0, 0.0);
    game.racerAccel.push(0.0, 0.0);
    game.racerRadius.push(radius);
    game.racerMass.push(volume * density);
    game.racerNextWaypoint.push(0);
    game.racerDest.push(0.0, 0.0, 0.0, 0.0);
    game.racerColor.push(0.0, 0.0, 1.0, 1.0);
    game.racerName.push("Player " + (i + 1));
    game.racerTopSpeed.push(20.0);
    game.racerTopAccel.push(15.0);
    game.racerIsHuman.push(false);
    game.racerKeyMap.push("\0\0\0\0");
  }
  game.racerKeyMap[0] = "WSAD";
  game.racerKeyMap[1] = "IKJL";
  game.racerIsHuman[0] = true; // I am, honest!
  game.racerColor.splice(0, 4, 1, 0, 0, 1);

  // Convert some racer data to typed arrays so it can be passed straight in to WebGL.
  game.racerPos = new Float32Array(game.racerPos);
  game.racerVel = new Float32Array(game.racerVel);
  game.racerAccel = new Float32Array(game.racerAccel);
  game.racerRadius = new Float32Array(game.racerRadius);
  game.racerMass = new Float32Array(game.racerMass);
  game.racerDest = new Float32Array(game.racerDest);
  game.racerColor = new Float32Array(game.racerColor);

  // Upload initial values for the racer-related vertex buffers to the GPU.
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerPosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.racerPos, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerRadiusBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.racerRadius, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerColorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.racerColor, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerDestBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.racerDest, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Set up the obstacle data.
  game.numObstacles = 16;
  for (var i = 0; i < game.numObstacles; i++) {
    var radius = Math.random() * 10.0 + 2.5;
    var volume = Math.PI * Math.pow( (radius / game.viewportHeight), 2.0);
    var density = Math.random() + 5.0; // Units: grammes per cubic centimetre -> g/cm^3. Earth is 5.52 g/cm^3

    game.obstaclePos.push(Math.random(), Math.random());
    game.obstacleRadius.push(radius);
    game.obstacleMass.push(volume * density);
    game.obstacleColor.push(0.435, 0.220, 0.0, 1.0);
  }
 
  // Convert some obstacle data to typed arrays so it can be passed straight in to WebGL.
  game.obstaclePos = new Float32Array(game.obstaclePos);
  game.obstacleRadius = new Float32Array(game.obstacleRadius);
  game.obstacleMass = new Float32Array(game.obstacleMass);
  game.obstacleColor = new Float32Array(game.obstacleColor);

  // Upload initial values for the obstacle-related vertex buffers to the GPU.
  gl.bindBuffer(gl.ARRAY_BUFFER, game.obstaclePosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.obstaclePos, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.obstacleRadiusBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.obstacleRadius, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.obstacleColorBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.obstacleColor, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Set up the waypoint data.
  game.numWaypoints = SolarSailorMap.numWaypoints;
  game.waypointPos = SolarSailorMap.waypointPos;
  game.waypointCenter = SolarSailorMap.waypointCenter;
  /*
  var kWaypointWidth = 0.15;
  for (var i = 0; i < game.numWaypoints; i++) {
    var x1 = Math.random();
    var y1 = Math.random();

    var angle = radians(Math.random() * 360.0);

    var x2 = x1 + Math.cos(angle) * kWaypointWidth;
    var y2 = y1 + Math.sin(angle) * kWaypointWidth;

    game.waypointPos.push(x1, y1, x2, y2);
  }
  */

  // Convert some waypoint data to typed arrays so it can be passed straight in to WebGL.
  game.waypointPos = new Float32Array(game.waypointPos);
  game.waypointCenter = new Float32Array(game.waypointCenter);

  // Upload values for the waypoint-related vertex buffers to the GPU.
  gl.bindBuffer(gl.ARRAY_BUFFER, game.waypointPosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.waypointPos, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.waypointCenterBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.waypointCenter, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Start with a reasonable value for the last update time.
  game.lastUpdate = Date.now();
}


function drawPlaying()
{
  var doPostprocessing = document.getElementById('postprocessing').checked;

  var transform;
  if (game.cameraMatrix) {
    transform = mat4.identity();
    mat4.inverse(game.cameraMatrix, transform);
    mat4.multiply(game.projectionMatrix, transform, transform);
  }
  else {
    transform = game.projectionMatrix;
  }

  // Bind the framebuffer. We draw into this so we can do some 2D post-processing afterwards.
  if (doPostprocessing)
    initPostprocess();
  gl.viewport(0, 0, game.viewportWidth, game.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Draw the racers.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(game.drawShader);
  game.drawShader.enableAttribs();
  gl.uniformMatrix4fv(game.drawShader.uniforms['worldToViewportMatrix'], false, transform);

  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerPosBuf);
  gl.vertexAttribPointer(game.drawShader.attribs['pos'], 2, gl.FLOAT, false, 8, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerRadiusBuf);
  gl.vertexAttribPointer(game.drawShader.attribs['radius'], 1, gl.FLOAT, false, 4, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerColorBuf);
  gl.vertexAttribPointer(game.drawShader.attribs['color'], 4, gl.FLOAT, false, 16, 0);
  gl.drawArrays(gl.POINTS, 0, game.numRacers);

  // Draw the obstacles, using the same shader 
  gl.bindBuffer(gl.ARRAY_BUFFER, game.obstaclePosBuf);
  gl.vertexAttribPointer(game.drawShader.attribs['pos'], 2, gl.FLOAT, false, 8, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.obstacleRadiusBuf);
  gl.vertexAttribPointer(game.drawShader.attribs['radius'], 1, gl.FLOAT, false, 4, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.obstacleColorBuf);
  gl.vertexAttribPointer(game.drawShader.attribs['color'], 4, gl.FLOAT, false, 16, 0);
  gl.drawArrays(gl.POINTS, 0, game.numObstacles);

  gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  game.drawShader.disableAttribs();

  // Draw the waypoints.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(game.waypointShader);
  game.waypointShader.enableAttribs();
  gl.uniformMatrix4fv(game.waypointShader.uniforms['worldToViewportMatrix'], false, transform);

  gl.uniform4f(game.waypointShader.uniforms['color'], 1.0, 1.0, 0.0, 0.75);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.waypointPosBuf);
  gl.vertexAttribPointer(game.waypointShader.attribs['pos'], 2, gl.FLOAT, false, 8, 0);
  gl.drawArrays(gl.POINTS, 0, game.numWaypoints * 2);
  gl.drawArrays(gl.LINES, 0, game.numWaypoints * 2);

  // Draw the racetrack.
  gl.uniform4f(game.waypointShader.uniforms['color'], 0.0, 0.0, 0.5, 0.75);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.waypointCenterBuf);
  gl.vertexAttribPointer(game.waypointShader.attribs['pos'], 2, gl.FLOAT, false, 8, 0);
  gl.drawArrays(gl.LINE_LOOP, 0, game.numWaypoints);

  // Draw the next waypoint marker for each of the racers.
  gl.uniform4f(game.waypointShader.uniforms['color'], 0.5, 0.5, 0.5, 0.75);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerDestBuf);
  gl.vertexAttribPointer(game.waypointShader.attribs['pos'], 2, gl.FLOAT, false, 8, 0);
  gl.drawArrays(gl.LINES, 0, game.numRacers * 2);
  gl.vertexAttribPointer(game.waypointShader.attribs['pos'], 2, gl.FLOAT, false, 16, 8);
  gl.drawArrays(gl.POINTS, 0, game.numRacers);

  gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  game.waypointShader.disableAttribs();

  // Unbind the intermediate framebuffer and prepare to do the real drawing.
  if (doPostprocessing)
    postprocess();
}


function initPostprocess()
{
  // Only create the framebuffers when postprocessing is switched on for the first time.
  while (game.framebuffers.length < 2)
    addFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, game.framebuffers[0]);
}


function postprocess()
{
  gl.bindFramebuffer(gl.FRAMEBUFFER, game.framebuffers[1]);
  gl.viewport(0, 0, game.viewportWidth, game.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Draw the intermediate texture on a screen-size quad, to run the fragment shader over it.
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, game.frameTextures[0]);

  gl.useProgram(game.postprocessShader);
  game.postprocessShader.enableAttribs();
  gl.uniformMatrix4fv(game.postprocessShader.uniforms['worldToViewportMatrix'], false, game.projectionMatrix);
  gl.uniform1i(game.postprocessShader.uniforms['tex'], 0);
  gl.uniform1fv(game.postprocessShader.uniforms['kernel'], game.blurKernel);
  gl.uniform2fv(game.postprocessShader.uniforms['uvOffset'], game.postprocessUVOffsets);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.quadBuf);
  gl.vertexAttribPointer(game.postprocessShader.attribs['pos'], 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(game.postprocessShader.attribs['uv'], 2, gl.FLOAT, false, 16, 8);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.disable(gl.DEPTH);

  gl.bindTexture(gl.TEXTURE_2D, game.frameTextures[1]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindTexture(gl.TEXTURE_2D, game.frameTextures[0]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.enable(gl.DEPTH);
  gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  game.postprocessShader.disableAttribs();
}


function updatePlaying()
{
  var end = game.numRacers * 2;
  var now = Date.now();

  var dt = (now - game.lastUpdate) / 1000.0; // in seconds
  if (dt > 0.25)
    dt = 0.25;

  var finished = [];

  // Check whether the racers are about to pass through their target waypoint.
  for (var i = 0; i < game.numRacers; i++) {
    // A = players current position, B = players position after this timestep.
    // C = left end of the waypoint, D = right end of the waypoint.
    var ax = game.racerPos[i * 2];
    var bx = game.racerVel[i * 2] * dt;
    var cx = game.waypointPos[game.racerNextWaypoint[i] * 4];
    var dx = game.waypointPos[game.racerNextWaypoint[i] * 4 + 2] - cx;
    var tx = (ax - cx) / (dx - bx);

    var throughWaypoint;
    if (tx < 0.0 || tx > 1.0) {
      throughWaypoint = false;
    }
    else {
      var ay = game.racerPos[i * 2 + 1];
      var by = game.racerVel[i * 2 + 1] * dt;
      var cy = game.waypointPos[game.racerNextWaypoint[i] * 4 + 1];
      var dy = game.waypointPos[game.racerNextWaypoint[i] * 4 + 3] - cy;
      var ty = (ay - cy) / (dy - by);
      throughWaypoint = (ty >= 0.0 && ty <= 1.0);
    }

    if (throughWaypoint) {
      game.racerNextWaypoint[i]++;
      if (game.racerNextWaypoint[i] >= game.numWaypoints) {
        finished.push(i);
        game.racerNextWaypoint[i] = 0;
      }
    }
  }

  if (finished.length > 1) {
    changeGameState(game.gameStates.tie);
    return;
  }
  else if (finished.length == 1) {
    // Check whether it was a player or an NPC that won.
    if (game.racerIsHuman[finished[0]])
      changeGameState(game.gameStates.win);
    else
      changeGameState(game.gameStates.lose);
    return;
  }

  // Update the racers.
  for (var i = 0; i < end; i++) {
    game.racerPos[i] += game.racerVel[i] * dt;
    game.racerVel[i] += game.racerAccel[i] * dt;
    if (game.racerPos[i] < 0) {
      game.racerPos[i] = -game.racerPos[i];
      game.racerVel[i] = -game.racerVel[i];
    }
    else if (game.racerPos[i] > 1) {
      game.racerPos[i] = 2.0 - game.racerPos[i];
      game.racerVel[i] = -game.racerVel[i];
    }

    game.racerAccel[i] = 0.0;
  }

  // Calculate the effect of gravity on each of the racers.
  for (var i = 0; i < game.numRacers; i++) {
    var gx = 0;
    var gy = 0;

    var m1 = game.racerMass[i];
    for (var o = 0; o < game.numObstacles; o++) {
      var m2 = game.obstacleMass[o];
      var dx = (game.obstaclePos[o * 2] - game.racerPos[i * 2]);
      var dy = (game.obstaclePos[o * 2 + 1] - game.racerPos[i * 2 + 1]);
      var distSqr = dx * dx + dy * dy;
      if (distSqr < 1e-6)
        continue;

      var F = kG * m1 * m2 / distSqr;
      gx += F * dx;
      gy += F * dy;
    }

    game.racerAccel[i * 2] += gx;
    game.racerAccel[i * 2 + 1] += gy;
  }

  // Handle inputs.
  if (game.keysDown[27]) { // 27 == the Esc key.
    changeGameState(game.gameStates.gameSetup);
    return;
  }
  else if (game.keysDown[" "]) {
    changeGameState(game.gameStates.paused);
    return;
  }

  for (var i = 0; i < game.numRacers; i++) {
    if (game.racerIsHuman[i])
      updateHuman(i, dt);
    else
      updateAI(i, dt);

    // Clamp speed and acceleration to their maximums.
    var x = i * 2;
    var y = x + 1;
    var speed = Math.sqrt(game.racerVel[x] * game.racerVel[x] + game.racerVel[y] * game.racerVel[y]);
    var accel = Math.sqrt(game.racerAccel[x] * game.racerAccel[x] + game.racerAccel[y] * game.racerAccel[y]);
    if (speed > game.racerTopSpeed[i]) {
      var scale = game.racerTopSpeed[i] / speed;
      game.racerVel[x] *= scale;
      game.racerVel[y] *= scale;
      game.racerAccel[x] = 0;
      game.racerAccel[y] = 0;
    }
    else if (accel > game.racerTopAccel[i]) {
      var scale = game.racerTopAccel[i] / accel;
      game.racerAccel[x] *= scale;
      game.racerAccel[y] *= scale;
    }
  }

  // Update the racer position -> next waypoint coords.
  for (var i = 0; i < game.numRacers; i++) {
    var outx = i * 4;
    var outy = outx + 1;
    var ax = game.racerPos[i * 2];
    var ay = game.racerPos[i * 2 + 1];

    game.racerDest[outx] = ax;
    game.racerDest[outy] = ay;

    var wpx = game.racerNextWaypoint[i] * 2;
    var wpy = wpx + 1;
    var bx = game.waypointCenter[wpx] - ax;
    var by = game.waypointCenter[wpy] - ay;

    var kMaxLength = 0.1;
    var actualLength = Math.sqrt(bx * bx + by * by);
    if (actualLength > kMaxLength) {
      var scale = kMaxLength / actualLength;
      bx *= scale;
      by *= scale;
    }

    game.racerDest[outx + 2] = ax + bx;
    game.racerDest[outy + 2] = ay + by;
  }

  game.lastUpdate = now;

  // Update the GL buffers.
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerPosBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, game.racerPos);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerDestBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, game.racerDest);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}


function updateHuman(i, dt)
{
  var accel = game.racerTopAccel[i] * dt;
  var keymap = game.racerKeyMap[i];
  var x = i * 2;
  var y = x + 1;

  if (game.keysDown[keymap[0]])
    game.racerAccel[y] += accel;
  if (game.keysDown[keymap[1]])
    game.racerAccel[y] -= accel;
  if (game.keysDown[keymap[2]])
    game.racerAccel[x] -= accel;
  if (game.keysDown[keymap[3]])
    game.racerAccel[x] += accel;
}


function updateAI(i, dt)
{
  var accel = game.racerTopAccel[i] * dt;
  var x = i * 2;
  var y = x + 1;

  var posX = game.racerPos[x];
  var posY = game.racerPos[y];
  var velX = game.racerVel[x];
  var velY = game.racerVel[y];
  var accelX = game.racerAccel[x];
  var accelY = game.racerAccel[y];

  var targetX = game.racerDest[i * 4 + 2];
  var targetY = game.racerDest[i * 4 + 3];

  targetX += (Math.random() - 0.5) * accel;
  targetY += (Math.random() - 0.5) * accel;

  // Strategy is to try to always accelerate directly towards where they think
  // the next waypoint is.
  var desiredVelX = targetX - posX;
  var desiredVelY = targetY - posY;
  var desiredAccelX = desiredVelX - velX;
  var desiredAccelY = desiredVelY - velY;

  if (desiredAccelX < 0)
    game.racerAccel[x] -= accel;
  else if (desiredAccelX > 0)
    game.racerAccel[x] += accel;

  if (desiredAccelY < 0)
    game.racerAccel[y] -= accel;
  else if (desiredAccelY > 0)
    game.racerAccel[y] += accel;
}


function drawTitles()
{
  var transform;
  if (game.cameraMatrix) {
    transform = mat4.identity();
    mat4.inverse(game.cameraMatrix, transform);
    mat4.multiply(game.projectionMatrix, transform, transform);
  }
  else {
    transform = game.projectionMatrix;
  }

  if (game.titleTexture.isLoaded) {
    var w = game.titleTexture.image.width / game.viewportWidth;
    var h = game.titleTexture.image.height / game.viewportHeight;
    var dx = (1.0 - w) / 2.0;
    var dy = (1.0 - h) / 2.0;
    mat4.translate(transform, [dx, dy, 0.0]);
    mat4.scale(transform, [w, h, 1.0]);
  }

  gl.viewport(0, 0, game.viewportWidth, game.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Draw the title screen texture.
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, game.titleTexture);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(game.textShader);
  game.textShader.enableAttribs();
  gl.uniformMatrix4fv(game.textShader.uniforms['worldToViewportMatrix'], false, transform);
  gl.uniform1i(game.textShader.uniforms['tex'], 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.quadBuf);
  gl.vertexAttribPointer(game.textShader.attribs['pos'], 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(game.textShader.attribs['uv'], 2, gl.FLOAT, false, 16, 8);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  game.textShader.disableAttribs();

  // Draw some text too.
  text(0.5, 0.10, 24, "press <space> to start");
}


function updateTitles()
{
  // Press space to start...
  if (game.keysDown[" "])
    changeGameState(game.gameStates.gameSetup);
}


function drawGameSetup()
{
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
  var numPlayers = 0;
  for (var i = 0; i < game.numRacers && game.racerIsHuman[i]; i++)
    numPlayers++;

  text(0.5, 0.5, 36, "# players: " + numPlayers);
  text(0.5, 0.4, 18, "push <up> or <down> to change, <space> to start game");
  if (numPlayers > 0)
    text(0.5, 0.3, 18, "P1 controls: " + game.racerKeyMap[0]);
  if (numPlayers > 1)
    text(0.5, 0.2, 18, "P2 controls: " + game.racerKeyMap[1]);
}


function updateGameSetup()
{
  game.lastUpdate = Date.now();

  var numPlayers = 0;
  for (var i = 0; i < game.numRacers && game.racerIsHuman[i]; i++)
    numPlayers++;

  if (game.keysDown[38] && numPlayers < 2) { // Up arrow
    game.racerIsHuman[numPlayers] = true;
    numPlayers++;
    clearKeyboard();
  }
  if (game.keysDown[40] && numPlayers > 0) { // Down arrow
    numPlayers--;
    game.racerIsHuman[numPlayers] = false;
    clearKeyboard();
  }

  if (game.keysDown[" "])
    changeGameState(game.gameStates.countdown);
  else if (game.keysDown[27])
    changeGameState(game.gameStates.titles);
}


function beginGameSetup()
{
  for (var i = 0; i < game.numRacers; i++) {
    var ix = i * 2;
    var iy = ix + 1;

    // TODO: reset the racer position to a default value.
    game.racerVel[ix] = 0.0;
    game.racerVel[iy] = 0.0;
    game.racerAccel[ix] = 0.0;
    game.racerAccel[iy] = 0.0;
    game.racerNextWaypoint[i] = 0;
  }
}


function drawCountdown()
{
  drawPlaying();

  var dt = Math.floor(3.999 - (game.lastUpdate - game.lastStateChange) / 1000.0);
  var str;
  if (dt == 0)
    str = "go!!!";
  else
    str = new Number(dt).toFixed(0);

  if (dt >= 0)
    text(0.5, 0.25, 48, str);
}


function updateCountdown()
{
  game.lastUpdate = Date.now();

  if (game.keysDown[27]) { // Escape key
    changeGameState(game.gameStates.gameSetup);
    return;
  }

  var dt = Math.floor(3.999 - (game.lastUpdate - game.lastStateChange) / 1000.0);
  if (dt < 0)
    changeGameState(game.gameStates.playing);
}


function drawWin()
{
  drawPlaying();
  text(0.5, 0.25, 48, "you win!");
  text(0.5, 0.15, 24, "press <space> to continue");
}


function updateWin()
{
  game.lastUpdate = Date.now();

  var dt = (game.lastUpdate - game.lastStateChange) / 1000.0;
  var showFor = 5.0; // Time to show the message for, in seconds.

  if (game.keysDown[" "] || game.keysDown[27] || dt > showFor) {
    changeGameState(game.gameStates.titles);
    return;
  }
}


function drawLose()
{
  drawPlaying();
  text(0.5, 0.25, 48, "you lose!");
  text(0.5, 0.15, 24, "press <space> to continue");
}


function updateLose()
{
  game.lastUpdate = Date.now();

  var dt = (game.lastUpdate - game.lastStateChange) / 1000.0;
  var showFor = 5.0; // Time to show the message for, in seconds.

  if (game.keysDown[" "] || game.keysDown[27] || dt > showFor) {
    changeGameState(game.gameStates.titles);
    return;
  }
}


function drawTie()
{
  drawPlaying();
  text(0.5, 0.25, 48, "it's a tie!");
  text(0.5, 0.15, 24, "press <space> to continue");
}


function updateTie()
{
  game.lastUpdate = Date.now();

  var dt = (game.lastUpdate - game.lastStateChange) / 1000.0;
  var showFor = 5.0; // Time to show the message for, in seconds.

  if (game.keysDown[" "] || game.keysDown[27] || dt > showFor) {
    changeGameState(game.gameStates.titles);
    return;
  }
}


function drawPaused()
{
  drawPlaying();
  text(0.5, 0.25, 36, "press <space> to continue");
}


function updatePaused()
{
  game.lastUpdate = Date.now();

  // Press space to unpause...
  if (game.keysDown[" "])
    changeGameState(game.gameStates.playing);
}


function clearKeyboard()
{
  // Clear the keyboard state.
  for (key in game.keysDown)
    game.keysDown[key] = false;
}


function changeGameState(newState)
{
  game.lastUpdate = Date.now();
  clearKeyboard();

  // Change the state.
  game.currentGameState = newState;
  if (newState.begin)
    newState.begin();

  // Record the timestamp of the change.
  game.lastStateChange = game.lastUpdate;
}


function keyDown(event)
{
  game.keysDown[event.keyCode] = true;
  game.keysDown[String.fromCharCode(event.keyCode)] = true;
}


function keyUp(event)
{
  game.keysDown[event.keyCode] = false;
  game.keysDown[String.fromCharCode(event.keyCode)] = false;
}


//
// Helpers
//

function radians(angleInDegrees)
{
  return angleInDegrees * Math.PI / 180.0;
}


//
// Main
//

function main(drawCanvasId, textCanvasId)
{
  if (!drawCanvasId)
    drawCanvasId = "solarsailor-draw-canvas";
  if (!textCanvasId)
    textCanvasId = "solarsailor-text-canvas";

  var drawCanvas = document.getElementById(drawCanvasId);
  var textCanvas = document.getElementById(textCanvasId);
  init(drawCanvas, textCanvas);

  document.onkeydown = keyDown;
  document.onkeyup = keyUp;

  tick = function () {
    window.requestAnimFrame(tick);
    if (game.currentGameState == null)
      game.currentGameState = game.gameStates.titles;
    game.currentGameState.draw();
    game.currentGameState.update();
  }
  tick();
}


return {
  'main': main
};

}(); // end of the SolarSailor namespace.

