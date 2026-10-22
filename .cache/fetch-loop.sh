#!/bin/bash
cd /home/z/my-project
for i in $(seq 1 25); do
  bun scripts/fetch-osm-pois.ts >> .cache/fetch-osm.log 2>&1
  n=$(ls .cache/osm-city/*.json 2>/dev/null | wc -l)
  echo "── pass $i: $n/29 ciudades en caché ──" >> .cache/fetch-osm.log
  [ "$n" -ge 29 ] && break
  sleep 15
done
echo "LOOP DONE" >> .cache/fetch-osm.log
