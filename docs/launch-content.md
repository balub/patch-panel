# Patch Panel — Launch Content

## Tweet Thread

**Tweet 1**
I got tired of Homer and Dashy taking up a whole tab just to click into my homelab services.

So I built Patch Panel — a thin bar that lives on top of every page. Describe your services in YAML. One click to anything. No tab wasted.

**Tweet 2**
It's a Chrome extension. Works on every page you're already on.

YAML config — no GUI fiddling. Services, groups, dropdowns, icons. Everything you'd want from a homelab launcher, none of the overhead.

**Tweet 3**
Just shipped it to the Chrome Web Store.
→ https://chromewebstore.google.com/detail/patch-panel/cahgdpcbmgjmoknbndcmgmabnlffaaod

Open source too: github.com/balub/patch-panel

If you self-host anything, give it a try — would love feedback.

---

## Reddit — r/selfhosted

**Title:** I built a YAML-driven Chrome extension that puts all your self-hosted services one click away — without taking over a tab

**Body:**
I love Homer and Dashy, but kept hitting the same friction: open a new tab → navigate to dashboard → click to the service I actually wanted. Three clicks, one wasted tab.

So I built Patch Panel — a Chrome extension that injects a thin bar across the top of every page. You describe your services in a YAML file (services, groups, icons) and the bar renders from it.

[GIF here]

Example config:
```yaml
title: My Homelab
displayMode: icon_text

items:
  - type: service
    name: Grafana
    url: https://grafana.local
    icon: https://www.google.com/s2/favicons?domain=grafana.com&sz=64

  - type: group
    name: Media
    items:
      - type: service
        name: Plex
        url: http://plex.local:32400/web
```

Chrome Web Store: https://chromewebstore.google.com/detail/patch-panel/cahgdpcbmgjmoknbndcmgmabnlffaaod
Source: github.com/balub/patch-panel

Would love feedback — especially on the YAML schema. Next up: glanceable monitor items (CPU, memory, disk stats) right in the bar.

---

## Reddit — r/homelab

**Title:** Patch Panel — a Chrome extension that puts your homelab services in a persistent bar on every page, no dedicated tab needed

**Body:**
Built this because I kept alt-tabbing to Homer just to navigate somewhere. Patch Panel is a Chrome extension that injects a thin bar at the top of every browser page — services, groups with dropdowns, icons, all driven by a YAML config.

[GIF here]

No GUI, just edit your YAML and it reloads. Works on any page you're already on.

Chrome Web Store: https://chromewebstore.google.com/detail/patch-panel/cahgdpcbmgjmoknbndcmgmabnlffaaod
Open source: github.com/balub/patch-panel

Next thing I'm building is glanceable stats in the bar (CPU, memory, disk via Glances). If that sounds useful — what metrics do you care about most?

---

## WhatsApp (dev/homelab group)

Hey — shipped something I've been working on. Patch Panel is a Chrome extension that injects a thin YAML-configured bar across every page so your homelab services are always one click away. No dedicated dashboard tab needed, no GUI — just describe your services in a YAML file and it renders.

Just hit the Chrome Web Store: https://chromewebstore.google.com/detail/patch-panel/cahgdpcbmgjmoknbndcmgmabnlffaaod

Open source too: github.com/balub/patch-panel. Would love to hear what you think.

---

## Product Hunt

**Recommended tagline options:**
- "Your homelab services, always one click away"
- "A YAML-driven launcher for self-hosted services"

**Maker first comment (tell the story):**
I got frustrated with Homer and Dashy requiring a dedicated tab just to navigate to a service. I wanted the configurability of a YAML-driven dashboard but without the overhead — something that lives alongside whatever I'm already doing in the browser. That's Patch Panel.

**Launch checklist:**
- [ ] Demo video/GIF
- [ ] 2–3 screenshots of the bar on a real homelab browser session
- [ ] Maker first comment posted immediately after launch
- [ ] Post to r/selfhosted and r/homelab on the same day

**Timing:** Launch Tuesday–Thursday. Avoid Mondays and weekends.

**Strategy:** The r/selfhosted and r/homelab posts will drive the first wave of genuine upvotes, which feeds the PH algorithm early in the day. Time the Reddit posts to go up within an hour of the PH launch.

**Note:** Homelab niche is smaller on PH than Reddit — expect more raw engagement on Reddit, but PH is worth it for the permanent directory listing and SEO.
