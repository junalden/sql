require("dotenv").config();
const express = require("express");
const mysql = require("mysql");
const cors = require("cors"); // Import cors
const app = express();
const port = process.env.PORT || 5000;

// Use CORS middleware
app.use(cors()); // This will allow all origins by default

// Middleware to parse JSON
app.use(express.json());

// const db = mysql.createConnection({
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// db.connect((err) => {
//   if (err) {
//     console.error("Error connecting to MySQL:", err);
//     return;
//   }
//   console.log("Connected to MySQL");
// });
// Function to get a connection from the pool
const getConnection = (callback) => {
  pool.getConnection((err, connection) => {
    if (err) {
      console.error("Error getting connection from pool:", err);
      callback(err);
      return;
    }
    callback(null, connection);
  });
};

// API route to create a new user
app.post("/api/create-account", (req, res) => {
  const { email, password } = req.body;
  getConnection((err, connection) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
      return;
    }
    const query = "INSERT INTO users (email, password) VALUES (?, ?)";
    connection.query(query, [email, password], (err, result) => {
      connection.release(); // Release connection back to the pool
      if (err) {
        console.error("Error inserting user:", err.message);
        res.status(500).json({ error: "Database error", details: err.message });
        return;
      }
      res.status(201).json({ message: "Account created successfully" });
    });
  });
});

// API route to authenticate a user
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  getConnection((err, connection) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
      return;
    }
    const query = "SELECT * FROM users WHERE email = ? AND password = ?";
    connection.query(query, [email, password], (err, results) => {
      connection.release(); // Release connection back to the pool
      if (err) {
        console.error("Error querying user:", err.message);
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
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
