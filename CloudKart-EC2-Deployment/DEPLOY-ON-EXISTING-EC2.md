# Deploy CloudKart to an existing Amazon Linux 2023 EC2 instance

This project needs Node.js + Nginx, not just Apache/static HTML. It includes a product catalogue, search, category filters, cart, checkout, server-side order creation, JSON order storage, and an EC2 health banner. Demo only: no real payment processing.

## Deploy
1. Copy this project directory onto the EC2 instance (for example, by cloning your GitHub repository).
2. From the project directory run:
   `sudo bash deploy/install-on-ec2.sh`
3. Verify:
   `sudo systemctl status cloudkart --no-pager`
   `sudo systemctl status nginx --no-pager`
   `curl http://localhost:3000/api/health`
   `curl http://localhost/api/health`
4. Open `http://YOUR-EC2-PUBLIC-IP/`.

Security group inbound rules:
- SSH TCP 22 from My IP only
- HTTP TCP 80 from Anywhere-IPv4 (0.0.0.0/0)

Do not open port 3000 publicly; Nginx proxies HTTP traffic to the Node app locally.
