import math

WAYPOINT_WIDTH = 0.08


def exportMap(rotoNodeName='RotoPaint1', pathElemName='Racetrack'):
  n = nuke.toNode(rotoNodeName)
  k = n['curves']
  path = k.toElement(pathElemName)
  frameNum = 1.0

  mapWidth = float(nuke.root().format().width())
  mapHeight = float(nuke.root().format().height())
  mapSize = max(mapWidth, mapHeight)

  tx = (mapSize - mapWidth) / (2 * mapSize)
  ty = (mapSize - mapHeight) / (2 * mapSize)

  numWaypoints = len(path) + 1  # The extra 1 is because we duplicate the starting waypoint.
  waypointCenter = []
  waypointPos = []

  for cp in path:
    center = cp.center.getPosition(frameNum)
    direction = cp.rightTangent.getPosition(frameNum)

    cx = center.x / mapSize + tx
    cy = center.y / mapSize + ty

    perpDir = -direction.y, direction.x
    perpDirLen = math.sqrt(perpDir[0] ** 2 + perpDir[1] ** 2)
    perpDir = perpDir[0] / perpDirLen, perpDir[1] / perpDirLen

    perpPos0 = cx + perpDir[0] * WAYPOINT_WIDTH *  0.5, cy + perpDir[1] * WAYPOINT_WIDTH *  0.5 
    perpPos1 = cx + perpDir[0] * WAYPOINT_WIDTH * -0.5, cy + perpDir[1] * WAYPOINT_WIDTH * -0.5 

    waypointCenter.append( (cx, cy) )
    waypointPos.append( (perpPos0[0], perpPos0[1], perpPos1[0], perpPos1[1]) )

  # We deliberately duplicate the first waypoint here, to make it a closed
  # loop without need to add special cases in the game.
  with open("/Users/vilya/Code/SolarSailor/js/map.js", "w") as f:
    print >> f, "// Auto-generated, don't edit directly"
    print >> f, "var SolarSailorMap = {"
    print >> f, "  'numWaypoints': %d," % numWaypoints
    print >> f, "  'waypointPos': ["
    for wp in waypointPos:
      print >> f, "    %f, %f, %f, %f," % wp
    print >> f, "    %f, %f, %f, %f," % waypointPos[0]
    print >> f, "  ],"
    print >> f, "  'waypointCenter': ["
    for wc in waypointCenter:
      print >> f, "    %f, %f," % wc
    print >> f, "    %f, %f," % waypointCenter[0]
    print >> f, "  ],"
    print >> f, "};"


