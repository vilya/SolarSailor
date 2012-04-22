import math

WAYPOINT_WIDTH = 0.15


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

  numWaypoints = len(path)
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

  with open("/Users/vilya/Code/SolarSailor/js/map.js", "w") as f:
    print >> f, "var SolarSailorMap = {"
    print >> f, "  'numWaypoints': %d," % numWaypoints
    print >> f, "  'waypointPos': ["
    for wp in waypointPos:
      print >> f, "    %f, %f, %f, %f," % wp
    print >> f, "  ],"
    print >> f, "  'waypointCenter': ["
    for wp in waypointCenter:
      print >> f, "    %f, %f," % wp
    print >> f, "  ],"
    print >> f, "};"


