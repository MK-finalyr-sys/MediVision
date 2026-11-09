#!/bin/bash
# Verify the <title> of each remaining candidate source URL (200 alone is not enough — must be the right page)
check() {
  html=$(curl -s -L --max-time 15 -A "Mozilla/5.0 (X11; Linux x86_64)" "$1")
  title=$(echo "$html" | grep -oiE "<title>[^<]*</title>" | head -1)
  echo "[$1] => $title"
}
check "https://medlineplus.gov/druginfo/meds/a601209.html"
check "https://medlineplus.gov/druginfo/meds/a682607.html"
check "https://medlineplus.gov/druginfo/meds/a601032.html"
check "https://medlineplus.gov/druginfo/meds/a682461.html"
check "https://medlineplus.gov/druginfo/meds/a601040.html"
check "https://medlineplus.gov/druginfo/meds/a698007.html"
check "https://medlineplus.gov/druginfo/meds/a698012.html"
check "https://medlineplus.gov/druginfo/meds/a603004.html"
check "https://medlineplus.gov/druginfo/meds/a699048.html"
check "https://medlineplus.gov/druginfo/meds/a682145.html"
check "https://medlineplus.gov/druginfo/meds/a601151.html"
check "https://medlineplus.gov/druginfo/meds/a682583.html"
check "https://medlineplus.gov/druginfo/meds/a682561.html"
check "https://medlineplus.gov/druginfo/meds/a603006.html"
check "https://www.nhs.uk/medicines/"
check "https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-d/"
check "https://www.nhs.uk/conditions/vitamins-and-minerals/vitamin-b/"
check "https://www.nhs.uk/conditions/vitamins-and-minerals/calcium/"
check "https://www.drugs.com/telmisartan.html"
check "https://www.drugs.com/mefenamic-acid.html"
check "https://www.drugs.com/dicyclomine.html"
check "https://www.drugs.com/minoxidil.html"
check "https://www.drugs.com/ondansetron.html"
check "https://www.drugs.com/calcium-carbonate.html"
check "https://www.who.int/news-room/spotlight/why-wash-your-hands" # control
