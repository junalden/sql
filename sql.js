const express = require("express");
const mysql = require("mysql");
const bcrypt = require("bcrypt"); // Import bcrypt
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
// const { generateToken } = require("./authUtils");

// Use CORS middleware
app.use(cors()); // This will allow all origins by default

// Middleware to parse JSON
app.use(express.json());

const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

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
app.post("/api/create-account", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    getConnection((err, connection) => {
      if (err) {
        res.status(500).json({ error: "Database error" });
        return;
      }

      const query = "INSERT INTO users (email, password) VALUES (?, ?)";
      connection.query(query, [email, hashedPassword], (err, result) => {
        connection.release(); // Release connection back to the pool

        if (err) {
          console.error("Error inserting user:", err.message);
          res
            .status(500)
            .json({ error: "Database error", details: err.message });
          return;
        }

        res.status(201).json({ message: "Account created successfully" });
      });
    });
  } catch (error) {
    res.status(500).json({ error: "Hashing error" });
  }
});

// Function to generate JWT tokens
const jwt = require("jsonwebtoken");

const generateToken = (user) => {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
};

// module.exports = { generateToken };

// API route to authenticate a user
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  getConnection((err, connection) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
      return;
    }

    const query = "SELECT * FROM users WHERE email = ?";
    connection.query(query, [email], async (err, results) => {
      connection.release(); // Release connection back to the pool

      if (err) {
        console.error("Error querying user:", err.message);
        res.status(500).json({ error: "Database error", details: err.message });
        return;
      }

      if (results.length > 0) {
        const user = results[0];

        // Compare the provided password with the hashed password
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
          // Generate a JWT token and send it to the client
          const token = generateToken(user);
          res.status(200).json({ message: "Login successful", token });
        } else {
          res.status(401).json({ error: "Invalid credentials" });
        }
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    });
  });
});

app.post("/api/save-matrix", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1]; // Extract JWT token
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }

    const userId = decoded.userId; // Extract userId from token
    const { matrix } = req.body;

    if (!userId || !matrix || !Array.isArray(matrix)) {
      return res.status(400).json({ error: "Invalid input data" });
    }

    getConnection((err, connection) => {
      if (err) {
        res.status(500).json({ error: "Database error" });
        return;
      }

      const query =
        "INSERT INTO matrix_data (user_id, column_name, transformation) VALUES ?";
      const values = matrix.map((row) => [
        userId,
        row.columnName,
        row.transformation,
      ]);

      connection.query(query, [values], (err, result) => {
        connection.release(); // Release connection back to the pool

        if (err) {
          console.error("Error inserting matrix data:", err.message);
          res
            .status(500)
            .json({ error: "Database error", details: err.message });
          return;
        }
        res.status(201).json({ message: "Matrix data saved successfully" });
      });
    });
  });
});

app.get("/api/get-matrix/:userId", (req, res) => {
  const userId = req.params.userId;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  getConnection((err, connection) => {
    if (err) {
      res.status(500).json({ error: "Database error" });
      return;
    }

    const query =
      "SELECT column_name, transformation FROM matrix_data WHERE user_id = ?";

    connection.query(query, [userId], (err, results) => {
      connection.release(); // Release connection back to the pool

      if (err) {
        console.error("Error retrieving matrix data:", err.message);
        res.status(500).json({ error: "Database error", details: err.message });
        return;
      }

      res.status(200).json(results);
    });
  });
});

// Function to generate JWT token (example, replace with your implementation)
const generateJwtToken = (user) => {
  // Your JWT generation logic here
  return "your-jwt-token";
};

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
