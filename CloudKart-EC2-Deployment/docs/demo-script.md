# Video presentation script — Set-B (EC2-hosted online shopping website)

Rules from the question paper: face visible, audio loud, **every team member speaks**, single
video, **10–20 minutes**. Record the AWS Management Console screen with a webcam overlay
(OBS Studio, or Zoom "record with video" while sharing the screen).

Below is a 14-minute plan for a 4-member team. Merge or split the parts to match your team size.

---

## Member 1 — Problem & architecture (≈3 min)
1. Introduce the team and the case study on camera before sharing the screen.
2. The problem: a small company wants an online shopping website — frontend, backend and
   product information — and does **not** want to buy, rack, power and maintain a server.
3. The solution: **Amazon EC2** — rent a virtual server, pay per hour, resize or terminate anytime.
4. Walk through the architecture diagram in `README.md`:
   Internet → Security Group → EC2 (Nginx :80 → Node.js :3000 → products.json) → users.
5. State the chosen configuration: Amazon Linux 2023, `t3.micro`, Nginx, Node.js, SG allowing 80 and 22.

> Useful line: "EC2 gives us the server; the security group is the firewall in front of it;
> Nginx is the web server; Node.js is our backend application."

## Member 2 — Launching the instance in the console (≈4 min)
Screen-share the AWS Management Console and narrate each click:
1. EC2 → Instances → **Launch instances**; name it `cloudkart-web`.
2. **AMI**: Amazon Linux 2023 — point out "Free tier eligible".
3. **Instance type**: `t3.micro` — 2 vCPU, 1 GiB RAM, enough for a basic demo.
4. **Key pair**: create `cloudkart-key` (.pem) — explain this is the SSH credential for port 22.
5. **Network settings**: enable auto-assign public IP; create security group `cloudkart-sg` with
   - SSH 22 from **My IP** (say *why* not 0.0.0.0/0 — anyone could then attempt to log in)
   - HTTP 80 from **Anywhere** (customers must reach the shop)
6. **Advanced details → User data**: paste `deploy/user-data.sh` and read out what it does —
   installs Node.js and Nginx, registers a systemd service, configures the reverse proxy.
7. Launch, then show the instance list going `Pending → Running` and `2/2 checks passed`.
   Point out the **Public IPv4 address** and **Public IPv4 DNS**.

## Member 3 — Deploying and verifying on the instance (≈4 min)
1. SSH in: `ssh -i cloudkart-key.pem ec2-user@<PUBLIC_IP>` — note that this works *because*
   port 22 is open in the security group.
2. Show the app is there and running:
   ```bash
   ls /opt/cloudkart
   systemctl status cloudkart
   systemctl status nginx
   curl localhost:3000/api/health
   curl localhost/api/health
   ```
   Explain the two curls: the first hits Node directly, the second goes through Nginx on port 80.
3. Show the product information file: `head -30 /opt/cloudkart/data/products.json`.
4. Leave a live log tail running in a second terminal for the next part:
   `sudo journalctl -u cloudkart -f`

## Member 4 — Working website demo (≈3 min)
1. Open `http://<PUBLIC_IP>/` in a browser — say the public IP out loud.
2. Point to the line under the hero text: it prints the **EC2 hostname and OS** returned by
   `/api/health` — proof the page is served from the cloud instance, not localhost.
3. Demo the frontend: filter by category, search "cloud", add two items to the cart,
   change quantities, see the free-shipping threshold apply.
4. Checkout with a name, email and address → show the receipt with the order ID and the
   **EC2 instance that processed the order**.
5. Switch to the SSH terminal: the request log shows the `POST /api/orders` that just arrived,
   and `cat /opt/cloudkart/data/orders.json` shows the stored order. Reload the shop to show
   the stock count has dropped.
6. Hit the API directly from the browser: `http://<PUBLIC_IP>/api/products?category=Electronics`.

## All members — wrap-up (≈1 min, faces on camera)
- One member: edit `cloudkart-sg`, delete the HTTP :80 rule, refresh the site → it times out;
  add the rule back → it loads again. This is the clearest single proof of what a security
  group does.
- Mention what you would add in production: Elastic IP (so the address survives a stop/start),
  an Application Load Balancer with an Auto Scaling group, RDS instead of a JSON file,
  S3 + CloudFront for images, HTTPS via ACM.
- Terminate the instance on camera to show cost control, and state the total marks section is
  complete.

---

## Pre-recording checklist
- [ ] Instance running, site reachable from a phone on mobile data (proves it's public)
- [ ] Browser zoom ≥ 125% and terminal font enlarged so text is readable in the recording
- [ ] Webcam overlay positioned so it does not cover the console
- [ ] Mic tested; no background noise
- [ ] Each member knows their section and has rehearsed once end to end
- [ ] AWS account billing alarm set (or just terminate right after recording)
- [ ] Recording length between 10 and 20 minutes
