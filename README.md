# CloudKart — online shopping website on Amazon EC2

Case study (Set-B): *a small company wants to host its online shopping website — frontend,
backend application and product information — on an Amazon EC2 instance instead of buying a
physical server.*

This repo is that website.

| Case-study requirement | How it is met here |
|---|---|
| Frontend | `public/` — responsive HTML/CSS/JS storefront (catalogue, search, categories, cart, checkout) |
| Backend application | `server.js` — Node.js HTTP API (`/api/products`, `/api/categories`, `/api/orders`, `/api/health`) |
| Product information | `data/products.json` — 12 products across 5 categories; orders persist to `data/orders.json` |
| Web server | Nginx on port 80 reverse-proxying the Node app on port 3000 (`deploy/user-data.sh`) |
| OS / instance type | Amazon Linux 2023, `t3.micro` |
| Security group | Inbound HTTP :80 from `0.0.0.0/0`, SSH :22 from *My IP* |

The backend has **zero npm dependencies**, so the instance needs nothing but `nodejs` —
no `npm install` step can fail during your demo.

## Architecture

```
            Internet
               |
               v
      +--------------------+
      |  Security Group    |   :80 open to the world, :22 to your IP
      +--------------------+
               |
      +--------------------+
      |   EC2 t3.micro     |   Amazon Linux 2023
      |   Nginx :80        |   web server / reverse proxy
      |   Node.js :3000    |   backend application (server.js)
      |   products.json    |   product information
      +--------------------+
               |
               v
         Website Users
```

## Run locally (to rehearse before recording)

```bash
node server.js
```

Then open http://localhost:3000

## Deploy on AWS — console walkthrough

### 1. Launch the EC2 instance
1. AWS Console → **EC2** → **Instances** → **Launch instances**.
2. **Name:** `cloudkart-web`
3. **AMI:** Amazon Linux 2023 (free tier eligible)
4. **Instance type:** `t3.micro`
5. **Key pair:** create/choose one (`cloudkart-key.pem`) — needed for SSH on port 22.
6. **Network settings → Edit:**
   - Auto-assign public IP: **Enable**
   - Create security group `cloudkart-sg` with:
     - SSH, TCP 22, Source **My IP**
     - HTTP, TCP 80, Source **Anywhere (0.0.0.0/0)**
7. **Advanced details → User data:** paste `deploy/user-data.sh`
   (set `REPO_URL` to your GitHub repo, or leave it and copy files in step 2).
8. **Launch instance** and wait for *Status check: 2/2 passed*.

### 2. Put the code on the instance
If you are not cloning from GitHub, copy it from your laptop:

```bash
scp -i cloudkart-key.pem -r server.js public data ec2-user@<PUBLIC_IP>:/opt/cloudkart/
ssh -i cloudkart-key.pem ec2-user@<PUBLIC_IP> "sudo systemctl restart cloudkart"
```

(On Windows run these from PowerShell; `scp`/`ssh` ship with Windows 10/11.)

### 3. Verify it is working
```bash
ssh -i cloudkart-key.pem ec2-user@<PUBLIC_IP>
systemctl status cloudkart        # backend running
systemctl status nginx            # web server running
curl localhost:3000/api/health    # backend answers locally
curl localhost/api/health         # through Nginx on port 80
sudo journalctl -u cloudkart -f   # live request log — leave this open while you browse
```

Then open **http://&lt;PUBLIC_IP&gt;/** in a browser. The banner under the hero text prints the
instance hostname and OS, which proves the page is served by EC2 and not your laptop.

### 4. Things worth demonstrating on camera
- Place an order → the receipt shows the EC2 hostname that processed it.
- `curl http://<PUBLIC_IP>/api/products?category=Electronics` from your own machine.
- `cat /opt/cloudkart/data/orders.json` on the instance — the order you just placed.
- Remove the port-80 rule from the security group → the site stops loading → add it back.
  (Clean, one-click proof that the security group is what exposes the site.)
- **Stop** the instance, note the public IP changes on restart, and mention Elastic IP as the fix.

### 5. Clean up (important — avoid charges)
EC2 → Instances → select → **Instance state → Terminate**.

## API reference

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | instance hostname, OS, uptime — the "it's really EC2" proof |
| GET | `/api/categories` | category list for the filter chips |
| GET | `/api/products?category=&q=` | product catalogue, filtered |
| GET | `/api/products/:id` | one product |
| POST | `/api/orders` | place an order (validates stock, computes shipping) |
| GET | `/api/orders` | all orders placed on this instance |

## Files

```
server.js              backend application + static file server
public/index.html      storefront markup
public/styles.css      styling (light + dark)
public/app.js          cart, search, checkout logic
data/products.json     product information
deploy/user-data.sh    EC2 user-data: installs Node + Nginx, starts the service
docs/demo-script.md    10-20 minute video presentation script, split by team member
```
