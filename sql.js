const express = require("express");
const mysql = require("mysql2/promise"); // Use mysql2 for promise-based queries
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

// Use CORS middleware
app.use(cors()); // This will allow all origins by default

// Middleware to parse JSON
app.use(express.json());

// Create a pool of connections
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Function to generate JWT tokens
const generateToken = (user) => {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
};

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.sendStatus(401); // If no token is found

  try {
    const user = await jwt.verify(token, process.env.JWT_SECRET);
    req.user = user; // Attach user object to request
    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    res.sendStatus(403); // If token is invalid
  }
};

// API route to create a new user
app.post("/api/create-account", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const connection = await pool.getConnection();
    try {
      const query = "INSERT INTO users (email, password) VALUES (?, ?)";
      await connection.query(query, [email, hashedPassword]);
      res.status(201).json({ message: "Account created successfully" });
    } finally {
      connection.release(); // Release connection back to the pool
    }
  } catch (error) {
    res.status(500).json({ error: "Hashing error" });
  }
});

// API route to authenticate a user
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const connection = await pool.getConnection();
  try {
    const query = "SELECT * FROM users WHERE email = ?";
    const [results] = await connection.query(query, [email]);

    if (results.length > 0) {
      const user = results[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (isMatch) {
        const token = generateToken(user);
        res.status(200).json({ message: "Login successful", token });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  } catch (error) {
    res.status(500).json({ error: "Database error", details: error.message });
  } finally {
    connection.release(); // Release connection back to the pool
  }
});

// API route to save matrix data
app.post("/api/save-matrix", authenticateToken, (req, res) => {
  const { matrixId, matrixData } = req.body;
  const userId = req.user.userId; // Extract userId from the token

  if (!userId || !Array.isArray(matrixData) || matrixData.length === 0) {
    return res.status(400).json({ error: "Invalid input data" });
  }

  getConnection((err, connection) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }

    // Generate new matrixId if not provided
    const generateNewMatrixId = (callback) => {
      const query =
        "SELECT MAX(matrix_id) AS maxMatrixId FROM matrix_data WHERE user_id = ?";
      connection.query(query, [userId], (err, results) => {
        if (err) {
          callback(err, null);
        } else {
          const lastMatrixId = results[0].maxMatrixId || 0; // If null, start with 0
          const newMatrixId = lastMatrixId + 1;
          callback(null, newMatrixId);
        }
      });
    };

    const insertMatrixData = (matrixIdToUse) => {
      const values = matrixData.map((row) => [
        userId,
        matrixIdToUse,
        row.columnName,
        row.transformation,
      ]);

      const query = `
        INSERT INTO matrix_data (user_id, matrix_id, column_name, transformation)
        VALUES ?
      `;

      connection.query(query, [values], (err, result) => {
        connection.release();
        if (err) {
          return res
            .status(500)
            .json({ error: "Database error", details: err.message });
        }

        res.status(201).json({
          message: "Matrix data saved successfully",
          matrixId: matrixIdToUse,
        });
      });
    };

    if (matrixId) {
      insertMatrixData(matrixId);
    } else {
      generateNewMatrixId((err, newMatrixId) => {
        if (err) {
          connection.release();
          return res.status(500).json({
            error: "Error generating new matrixId",
            details: err.message,
          });
        }
        insertMatrixData(newMatrixId);
      });
    }
  });
});
// Endpoint to load available matrices
app.get("/api/get-matrix-list", authenticateToken, async (req, res) => {
  const userId = req.user.userId; // Extract userId from the token

  const connection = await pool.getConnection();
  try {
    const query =
      "SELECT DISTINCT matrix_id FROM matrix_data WHERE user_id = ?";
    const [results] = await connection.query(query, [userId]);
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: "Database error", details: error.message });
  } finally {
    connection.release(); // Release connection back to the pool
  }
});

// Endpoint to get matrix data
app.get("/api/get-matrix/:matrixId", authenticateToken, async (req, res) => {
  const { matrixId } = req.params;
  const userId = req.user.userId; // Extract userId from the token

  const connection = await pool.getConnection();
  try {
    const query =
      "SELECT column_name, transformation FROM matrix_data WHERE matrix_id = ? AND user_id = ?";
    const [rows] = await connection.query(query, [matrixId, userId]);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Database error", details: error.message });
  } finally {
    connection.release(); // Release connection back to the pool
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
