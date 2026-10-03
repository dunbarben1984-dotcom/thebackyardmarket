# TheBackyardMarket.com — Setup Guide (Follow Every Step In Order)

Don't skip steps. Don't do them out of order. If something doesn't match what this
guide says, stop and re-read the step — don't guess.

This will take about 30-45 minutes the first time.

---

## What you need before you start

- [ ] A computer (Mac or Windows)
- [ ] Internet connection
- [ ] An email address
- [ ] A credit card (Stripe requires this to make an account, even in test mode — it will not charge you)

---

## PART 1: Install the tools

### Step 1.1 — Install Node.js

Node.js is the program that runs our backend code.

1. Go to **https://nodejs.org**
2. Click the big green button that says **LTS** (it will say something like "20.x.x LTS")
3. Open the file you downloaded and click "Continue" / "Next" / "Install" through every screen, using all the default settings
4. When it's done, restart your computer

**Check it worked:**
1. Open the "Terminal" app (Mac: search for "Terminal" in Spotlight; Windows: search for "Command Prompt")
2. Type exactly this and press Enter:
   ```
   node -v
   ```
3. You should see something like `v20.11.0`. If you see an error instead, go back to step 1.1.1.

---

## PART 2: Get a free database

The database is where all the farms, listings, and users get stored.

### Step 2.1 — Create a Neon account

1. Go to **https://neon.tech**
2. Click **Sign up**
3. Sign up with your email or Google account
4. When asked to create a project, name it `furrow-field` and click **Create**

### Step 2.2 — Copy your database connection string

1. On your new project's dashboard, look for a box labeled **Connection string**
2. Click the **Copy** button next to it
3. Open Notes (Mac) or Notepad (Windows) and paste it in
4. Label it `DATABASE_URL` above the pasted text — you'll need it in Step 4.2

It will look like this (yours will have different letters/numbers):
```
postgres://myuser:mypassword@ep-cool-name-123456.us-east-2.aws.neon.tech/furrow_field
```

### Step 2.3 — Build the tables in your database

1. In your Neon project, find and click the tab called **SQL Editor**
2. Open the file `database/schema.sql` from the project folder you downloaded (open it with TextEdit, Notepad, or any text editor)
3. Select all the text in that file (Ctrl+A or Cmd+A) and copy it (Ctrl+C or Cmd+C)
4. Paste it into the Neon SQL Editor box
5. Click the **Run** button
6. You should see a success message. If you see a red error, make sure you copied the *entire* file and try again.

---

## PART 3: Set up Stripe (this is what takes payments)

### Step 3.1 — Create a Stripe account

1. Go to **https://stripe.com**
2. Click **Start now** or **Sign up**
3. Fill in your email, name, and a password
4. Skip any business detail questions for now if it lets you — you can fill those in later. We'll work in **test mode**, which uses fake money, so nothing gets charged yet.

### Step 3.2 — Make sure you're in Test Mode

1. Once you're logged in, look at the top-right of the screen
2. There should be a toggle switch labeled **Test mode**. Turn it ON if it isn't already.

### Step 3.3 — Create the Farmer plan

1. On the left sidebar, click **Product catalog** (or "Products")
2. Click **+ Add product**
3. Fill in:
   - Name: `Farmer listing`
   - Pricing model: leave as **Standard pricing**
   - Price: `29.99`
   - Billing period: change the dropdown from "One time" to **Recurring**, then set it to **Yearly**
4. Click **Save product** (or **Add product**)
5. On the product's page, find the **Price** section and click on the price you just made
6. Copy the ID that starts with `price_...` — paste it into your Notes doc, labeled `STRIPE_FARMER_PRICE_ID`

### Step 3.4 — Create the Buyer plan

Repeat Step 3.3 exactly, but:
- Name: `Buyer membership`
- Price: `9.99`
- Billing period: **Yearly**

Copy that price ID into your Notes doc, labeled `STRIPE_BUYER_PRICE_ID`

### Step 3.5 — Get your secret key

1. On the left sidebar, click **Developers**
2. Click **API keys**
3. Find the box labeled **Secret key** (it starts with `sk_test_`)
4. Click **Reveal test key**, then copy it
5. Paste it into your Notes doc, labeled `STRIPE_SECRET_KEY`

⚠️ Never share this key with anyone or post it publicly. Treat it like a password.

### Step 3.6 — Set up the webhook (skip for now)

This step needs your website to already be online, so we'll come back to it in **Part 6**. For now, just write `STRIPE_WEBHOOK_SECRET=temporary` in your Notes doc — we'll replace it later.

---

## PART 4: Fill in your settings file

### Step 4.1 — Find the settings file

1. Open the project folder you downloaded (`furrow-field`)
2. Go into the `server` folder
3. Find the file named `.env.example`
4. Make a copy of it and rename the copy to exactly: `.env` (just `.env`, nothing before the dot)

### Step 4.2 — Fill it in

Open `.env` in a text editor. You'll see lines like `DATABASE_URL=...`. Replace everything after
the `=` sign on each line with the values you saved in your Notes doc:

| Line in .env | What to paste there |
|---|---|
| `DATABASE_URL=` | the connection string from Step 2.2 |
| `STRIPE_SECRET_KEY=` | the key from Step 3.5 |
| `STRIPE_WEBHOOK_SECRET=` | `temporary` (for now) |
| `STRIPE_FARMER_PRICE_ID=` | the price ID from Step 3.3 |
| `STRIPE_BUYER_PRICE_ID=` | the price ID from Step 3.4 |
| `JWT_SECRET=` | type any long random sentence, like `pineapple-truck-mountain-77` |
| `CLIENT_URL=` | leave as `http://localhost:5173` for now |
| `PORT=` | leave as `4242` |

Save the file.

---

## PART 5: Run it on your own computer

### Step 5.1 — Install the backend's pieces

1. Open Terminal (or Command Prompt)
2. Type this and press Enter (this moves you into the right folder — replace the path with wherever you saved the project):
   ```
   cd Downloads/furrow-field/server
   ```
3. Type this and press Enter:
   ```
   npm install
   ```
4. Wait for it to finish (you'll see a lot of text scroll by — that's normal)

### Step 5.2 — Start the backend

1. Type this and press Enter:
   ```
   npm start
   ```
2. You should see: `TheBackyardMarket.com API running on port 4242`
3. Leave this Terminal window open — closing it turns the backend off

### Step 5.3 — Open the website

1. Open the `furrow-field/public` folder
2. Double-click `index.html` — it opens in your web browser. This is the homepage.
3. Double-click `dashboard.html` — this is where farmers log in and manage listings

### Step 5.4 — Test it

1. On `dashboard.html`, click **Create account**
2. Fill in the form, choose "Farmer," and click **Create account**
3. If it works, you'll land on the dashboard screen. If you see a red error message, check that:
   - Terminal still shows the backend running (Step 5.2)
   - Your `.env` file is saved with real values, not the placeholder text

---

## PART 6: Put it online for real (so other people can use it)

This part happens after everything above works on your own computer.

### Step 6.1 — Put the backend online with Render

1. Go to **https://render.com** and sign up (free)
2. Put your project folder on GitHub first (Render deploys from GitHub):
   - Go to **https://github.com**, sign up, click **New repository**, name it `furrow-field`
   - Follow GitHub's on-screen instructions to upload your project folder
3. Back in Render, click **New +** → **Web Service**
4. Connect your GitHub account and pick the `furrow-field` repository
5. Set:
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `npm start`
6. Under **Environment Variables**, add every line from your `.env` file (one at a time: name and value)
7. Click **Create Web Service**
8. Wait for it to say **Live**, then copy the URL it gives you (looks like `https://furrow-field.onrender.com`)

### Step 6.2 — Put the website online with Netlify

1. Go to **https://netlify.com** and sign up (free)
2. Click **Add new site** → **Deploy manually**
3. Drag your `public` folder into the upload box
4. Netlify gives you a URL (like `https://furrow-field.netlify.app`) — that's your live website

### Step 6.3 — Connect the two

1. In `public/dashboard.html`, find the line near the top of the `<script>` section that says:
   ```
   const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:4242' : '';
   ```
   Change the empty `''` at the end to your Render URL from Step 6.1, in quotes.
2. Re-upload the `public` folder to Netlify (drag and drop again) so the change takes effect.
3. In Render, update the `CLIENT_URL` environment variable to your Netlify URL from Step 6.2, then save (Render will restart itself).

### Step 6.4 — Finish the Stripe webhook (the thing we skipped in Step 3.6)

1. In Stripe, go to **Developers** → **Webhooks** → **Add endpoint**
2. Endpoint URL: your Render URL + `/api/billing/webhook`
   (example: `https://furrow-field.onrender.com/api/billing/webhook`)
3. Under "Select events," check:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Click **Add endpoint**
5. Click on the endpoint you just made, find **Signing secret**, click **Reveal**, and copy it
6. In Render, update the `STRIPE_WEBHOOK_SECRET` environment variable with that value, then save

---

## You're done — now what?

- Test a full sign-up + payment using Stripe's fake test card: `4242 4242 4242 4242`, any future expiry date, any 3-digit CVC.
- When you're ready to accept real money, go back into Stripe and turn **Test mode** off, then repeat Steps 3.3–3.5 and 6.4 in live mode (the price IDs and secret key will be different in live mode).

## If something breaks

- **"npm: command not found"** → Node.js didn't install correctly. Redo Part 1.
- **Backend won't start / crashes immediately** → Open `.env` and check every line has a real value, no leftover `...` or blank spots.
- **Website loads but sign-up fails** → Make sure the Terminal from Step 5.2 is still open and running.
- **Payments don't work** → Double check you copied the *secret* key (starts `sk_test_`), not the *publishable* key (starts `pk_test_`).
