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
  'racerPosBuf': null,
  'racerVelBuf': null,

  'framebuffer': null,
  'frameTexture': null,
  'textTexture': null,

  'drawShader': null,
  'postprocessShader': null,
  'textShader': null,
  
  'postprocessKernel': null,
  'postprocessUVOffsets': null,

  'numRacers': 0,
  'racerPos': [],           // x,y values for each racer.
  'racerVel': [],           // x,y values for each racer
  'racerAccel': [],         // x,y values for each racer
  'racerRadius': [],        // single float for each racer
  'racerMass': [],          // single float for each racer
  'racerNextWaypoint': [],  // single int for each racer
  'racerSpriteID': [],      // single int for each racer
  'racerName': [],          // single string for each racer
  'racerTopSpeed': [],      // single float for each racer
  'racerTopAccel': [],      // single float for each racer
  'racerIsHuman': [],       // single bool for each racer
  'racerKeyMap': [], // keys, in order, for: up, down, left, right (e.g. "WSAD" for standard keys).

  'lastUpdate': 0,

  'keysDown': {},
};


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
  game.racerPosBuf = gl.createBuffer();
  game.racerVelBuf = gl.createBuffer();
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
      [ "worldToViewportMatrix" ], // uniforms
      [ "pos", "vel" ] );          // attributes
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
    var volume = 4.0 / 3.0 * Math.PI * Math.pow(radius, 3.0);
    var density = Math.random() + 5.0; // Units: grammes per cubic centimetre -> g/cm^3. Earth is 5.52 g/cm^3

    game.racerPos.push(Math.random(), Math.random());
    game.racerVel.push(0.0, 0.0);
    game.racerAccel.push(0.0, 0.0);
    game.racerRadius.push(radius);
    game.racerMass.push(volume * density);
    game.racerNextWaypoint.push(0);
    game.racerSpriteID.push(i);
    game.racerName.push("Player " + (i + 1));
    game.racerTopSpeed.push(10.0);
    game.racerTopAccel.push(1.0);
    game.racerIsHuman.push(false);
    game.racerKeyMap.push("\0\0\0\0");
  }
  game.racerKeyMap[0] = "WSAD";
  game.racerKeyMap[1] = "IKJL";

  game.racerIsHuman[0] = true; // I am, honest!

  // Convert some racer data to typed arrays so it can be passed straight in to WebGL.
  game.racerPos = new Float32Array(game.racerPos);
  game.racerVel = new Float32Array(game.racerVel);
  game.racerAccel = new Float32Array(game.racerAccel);
  game.racerRadius = new Float32Array(game.racerRadius);
  game.racerMass = new Float32Array(game.racerMass);

  // Upload initial values for the racer-related vertex buffers to the GPU.
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerPosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.racerPos, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerVelBuf);
  gl.bufferData(gl.ARRAY_BUFFER, game.racerVel, gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
 
  // Start with a reasonable value for the last update time.
  game.lastUpdate = Date.now();
}


function draw()
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

  // Bind the framebuffer. We draw into this so we can do some 2D post-processing afterwards.
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
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerVelBuf);
  gl.vertexAttribPointer(game.drawShader.attribs['vel'], 2, gl.FLOAT, false, 8, 0);
  gl.drawArrays(gl.POINTS, 0, game.numRacers);

  gl.disable(gl.BLEND);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  game.drawShader.disableAttribs();

  // Unbind the intermediate framebuffer and prepare to do the real drawing.
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
    }
    if (accel > game.racerTopAccel[i]) {
      var scale = game.racerTopAccel[i] / speed;
      game.racerAccel[x] *= scale;
      game.racerAccel[y] *= scale;
    }
  }

  game.lastUpdate = now;

  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerPosBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, game.racerPos);
  gl.bindBuffer(gl.ARRAY_BUFFER, game.racerVelBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, game.racerVel);
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

