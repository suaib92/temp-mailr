require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(express.static("public"));

const API_URL = process.env.MAIL_TM_API || "https://api.mail.tm";
const PORT = process.env.PORT || 3000;

let account = null;
let domain = null;

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 5000,
  headers: { "Content-Type": "application/json" },
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchDomain = async () => {
  try {
    const response = await apiClient.get("/domains");
    domain = response.data["hydra:member"][0]?.domain || null;
    console.log("✅ Fetched domain:", domain);
  } catch (error) {
    console.error("❌ Error fetching domain:", error.message);
    domain = null;
  }
};

const createMailAccount = async (email, password, retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await apiClient.post("/accounts", { address: email, password });
      return res.data;
    } catch (err) {
      if (err.response?.status === 429 && i < retries) {
        console.warn(`⚠️ Rate limit. Retrying in 3s (attempt ${i + 1})...`);
        await delay(3000);
      } else {
        throw err;
      }
    }
  }
};

app.get("/create-email", async (req, res) => {
  if (!domain) return res.status(500).json({ error: "Mail domain not available" });

  const timestamp = Date.now();
  const email = `user${timestamp}@${domain}`;
  const password = `Pass${timestamp}@XyZ`;

  try {
    await createMailAccount(email, password);
    account = { email, password };
    console.log("✅ Email created:", email);
    res.json({ email, password });
  } catch (error) {
    console.error("❌ Create Email Error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to create email",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/get-emails", async (req, res) => {
  if (!account) return res.status(400).json({ error: "No email created yet" });

  try {
    const loginRes = await apiClient.post("/token", {
      address: account.email,
      password: account.password,
    });

    const token = loginRes.data.token;

    const emailsRes = await apiClient.get("/messages", {
      headers: { Authorization: `Bearer ${token}` },
    });

    res.json(emailsRes.data["hydra:member"]);
  } catch (error) {
    console.error("❌ Inbox fetch error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to fetch emails",
      details: error.response?.data || error.message,
    });
  }
});

// Only start the server after fetching domain
const startServer = async () => {
  await fetchDomain();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
};

startServer();
