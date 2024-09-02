const express = require("express");
const mysql = require("mysql");
const app = express();
const port = process.env.PORT || 5000;

// Middleware to parse JSON
app.use(express.json());

// MySQL connection
const db = mysql.createConnection({
  host: "gator4128.hostgator.com",
  user: "technoti_PDF_USER",
  // CAPS
  password: "}-8_ft}6S[6%",
  database: "technoti_PDF",
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL");
});

// API route to create a new user
app.post("/api/create-account", (req, res) => {
  const { email, password } = req.body;
  const query = "INSERT INTO users (email, password) VALUES (?, ?)";
  db.query(query, [email, password], (err, result) => {
    if (err) {
      console.error("Error inserting user:", err.message); // Log error message
      res.status(500).json({ error: "Database error", details: err.message });
      return;
    }
    res.status(201).json({ message: "Account created successfully" });
  });
});

// API route to authenticate a user
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const query = "SELECT * FROM users WHERE email = ? AND password = ?";
  db.query(query, [email, password], (err, results) => {
    if (err) {
      console.error("Error querying user:", err.message); // Log error message
      res.status(500).json({ error: "Database error", details: err.message });
      return;
    }
    if (results.length > 0) {
      res.status(200).json({ message: "Login successful" });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
