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

  'framebuffer': null,
  'frameTexture': null,
  'textTexture': null,

  'drawShader': null,
  'waypointShader': null,
  'postprocessShader': null,
  'textShader': null,
  
  'postprocessKernel': null,
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
  'racerKeyMap': [],        // keys, in order, for: up, down, left, right (e.g. "WSAD" for standard keys).

  // Obstacles
  'numObstacles': 0,
  'obstaclePos': [],
  'obstacleRadius': [],
  'obstacleMass': [],
  'obstacleColor': [],

  // Waypoints
  'numWaypoints': 0,
  'waypointPos': [],        // A pair of x,y coordinates (i.e. 4 values) for each waypoint.

  'lastUpdate': 0,

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


function text(x, y, message)
{
  // Figure out the size we need the canvas to be.
  //var textSize = ctx.measureText(message);

  tl.clearRect(0, 0, tl.canvas.width, tl.canvas.height);
  tl.fillText(message, x, y);

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
  gl.uniformMatrix4fv(game.textShader.uniforms['worldToViewportMatrix'], false, game.projectionMatrix);
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
  tl.fillStyle = "#CC0000";   // The text colour, can take a hex or rgba value (e.g. rgba(255,0,0,0.5))
  tl.textAlign = "left";      // Text alignment, e.g. left, center, right
  tl.textBaseline = "top";	  // Baseline of the text, e.g. top, middle, bottom
  tl.font = "48px monospace";	// Size of the text and the font family used

  // Set up some OpenGL state.
  gl.clearColor(0.1, 0.1, 0.1, 1.0);
  gl.cullFace(gl.BACK);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

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

  // Create the intermediate rendering buffers & textures.
  game.framebuffer = gl.createFramebuffer();
  game.frameTexture = gl.createTexture(); // creating a texture to use as a render target.
  var rb = gl.createRenderbuffer(); // create a depth buffer to use with the render target.
  game.textTexture = gl.createTexture();

  // Initialise the intermediate buffers.
  gl.bindFramebuffer(gl.FRAMEBUFFER, game.framebuffer);
  gl.bindTexture(gl.TEXTURE_2D, game.frameTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, game.viewportWidth, game.viewportHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, game.viewportWidth, game.viewportHeight);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, game.frameTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

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
  game.postprocessKernel = new Float32Array([
    0.0,  0.0, -1.0,  0.0,  0.0,
    0.0, -1.0, -2.0, -1.0,  0.0,
   -1.0, -2.0, 16.0, -2.0, -1.0,
    0.0, -1.0, -2.0, -1.0,  0.0,
    0.0,  0.0, -1.0,  0.0,  0.0,
  ]);
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
  game.numWaypoints = 4;
  var kWaypointWidth = 0.15;
  for (var i = 0; i < game.numWaypoints; i++) {
    var x1 = Math.random();
    var y1 = Math.random();

    var angle = radians(Math.random() * 360.0);

    var x2 = x1 + Math.cos(angle) * kWaypointWidth;
    var y2 = y1 + Math.sin(angle) * kWaypointWidth;

    game.waypointPos.push(x1, y1, x2, y2);
  }

  // Convert some waypoint data to typed arrays so it can be passed straight in to WebGL.
  game.waypointPos = new Float32Array(game.waypointPos);

  // Upload values for the waypoint-related vertex buffers to the GPU.
  gl.bindBuffer(gl.ARRAY_BUFFER, game.waypointPosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.waypointPos, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  // Start with a reasonable value for the last update time.
  game.lastUpdate = Date.now();
}


function draw()
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, game.framebuffer);
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

  // Draw the next waypoint marker for each of the racers.
  gl.uniform4f(game.waypointShader.uniforms['color'], 0.5, 0.5, 0.5, 0.75);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerDestBuf);
  gl.vertexAttribPointer(game.waypointShader.attribs['pos'], 2, gl.FLOAT, false, 8, 0);
  gl.drawArrays(gl.LINES, 0, game.numRacers * 2);

  gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  game.waypointShader.disableAttribs();

  // Unbind the intermediate framebuffer and prepare to do the real drawing.
  if (doPostprocessing) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, game.viewportWidth, game.viewportHeight);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  
    // Draw the intermediate texture on a screen-size quad, to run the fragment shader over it.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, game.frameTexture);

    gl.useProgram(game.postprocessShader);
    game.postprocessShader.enableAttribs();
    gl.uniformMatrix4fv(game.postprocessShader.uniforms['worldToViewportMatrix'], false, transform);
    gl.uniform1i(game.postprocessShader.uniforms['tex'], 0);
    gl.uniform1fv(game.postprocessShader.uniforms['kernel'], game.postprocessKernel);
    gl.uniform2fv(game.postprocessShader.uniforms['uvOffset'], game.postprocessUVOffsets);
    gl.bindBuffer(gl.ARRAY_BUFFER, game.quadBuf);
    gl.vertexAttribPointer(game.postprocessShader.attribs['pos'], 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(game.postprocessShader.attribs['uv'], 2, gl.FLOAT, false, 16, 8);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.disable(gl.BLEND);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    game.postprocessShader.disableAttribs();
  }
/*
  // Draw the overlay text.
  var frameTime = new Number(Date.now() - game.lastUpdate);
  text(1, 1, "Frame time: " + frameTime.toFixed(0) + " ms");
*/
}


function update()
{
  var end = game.numRacers * 2;
  var now = Date.now();

  var dt = (now - game.lastUpdate) / 1000.0; // in seconds

  // Check whether the racers are about to pass through their target waypoint.
  for (var i = 0; i < game.numRacers; i++) {
    // A = players current position.
    var A = vec2.create([ game.racerPos[i * 2], game.racerPos[i * 2 + 1] ]);
    // B = players position after this timestep.
    var B = vec2.add(vec2.create([ game.racerVel[i * 2] * dt, game.racerVel[i * 2 + 1] * dt ]), A);
    // C = left end of the waypoint.
    var C = vec2.create([ game.waypointPos[game.racerNextWaypoint[i] * 4],
                          game.waypointPos[game.racerNextWaypoint[i] * 4 + 1] ]);
    // D = left end of the waypoint.
    var D = vec2.create([ game.waypointPos[game.racerNextWaypoint[i] * 4 + 2],
                          game.waypointPos[game.racerNextWaypoint[i] * 4 + 3] ]);

    var V0 = vec2.subtract(D, C);
    var V1 = vec2.subtract(A, C);
    var V2 = vec2.subtract(B, C);

    var before = vec2.cross(V0, V1);
    var after = vec2.cross(V0, V2);

    var throughWaypoint = (before < 0) != (after < 0);
    if (throughWaypoint)
      game.racerNextWaypoint[i] = (game.racerNextWaypoint[i] + 1) % game.numWaypoints;
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

    game.racerDest[outx] = game.racerPos[i * 2];
    game.racerDest[outy] = game.racerPos[i * 2 + 1];

    var wpx = game.racerNextWaypoint[i] * 4;
    var wpy = wpx + 1;
    var x = (game.waypointPos[wpx] + game.waypointPos[wpx + 2]) / 2.0;
    var y = (game.waypointPos[wpy] + game.waypointPos[wpy + 2]) / 2.0;

    game.racerDest[outx + 2] = x;
    game.racerDest[outy + 2] = y;
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
  // TODO
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
    draw();
    update();
  }
  tick();
}


return {
  'main': main
};

}(); // end of the SolarSailor namespace.

