const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

// Use CORS middleware
app.use(cors()); // This will allow all origins by default

// Middleware to parse JSON
app.use(express.json());

// Create a MySQL connection pool
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
    const query = "INSERT INTO users (email, password) VALUES (?, ?)";
    await connection.query(query, [email, hashedPassword]);
    connection.release(); // Release connection back to the pool

    res.status(201).json({ message: "Account created successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error creating account", details: error.message });
  }
});

// API route to authenticate a user
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await pool.getConnection();
    const query = "SELECT * FROM users WHERE email = ?";
    const [results] = await connection.query(query, [email]);
    connection.release(); // Release connection back to the pool

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
  } catch (error) {
    res.status(500).json({ error: "Error logging in", details: error.message });
  }
});

// API route to save matrix data
app.post("/api/save-matrix", authenticateToken, async (req, res) => {
  const { matrixId, matrixData } = req.body;
  const userId = req.user.userId; // Extract userId from the token

  if (!userId || !Array.isArray(matrixData) || matrixData.length === 0) {
    return res.status(400).json({ error: "Invalid input data" });
  }

  try {
    const connection = await pool.getConnection();

    // Generate new matrixId if not provided
    const [matrixIdResults] = await connection.query(
      "SELECT MAX(matrix_id) AS maxMatrixId FROM matrix_data WHERE user_id = ?",
      [userId]
    );
    const lastMatrixId = matrixIdResults[0].maxMatrixId || 0; // If null, start with 0
    const newMatrixId = matrixId || lastMatrixId + 1;

    const values = matrixData.map((row) => [
      userId,
      newMatrixId,
      row.columnName,
      row.transformation,
    ]);

    const query = `
      INSERT INTO matrix_data (user_id, matrix_id, column_name, transformation)
      VALUES ?
    `;
    await connection.query(query, [values]);
    connection.release(); // Release connection back to the pool

    res.status(201).json({
      message: "Matrix data saved successfully",
      matrixId: newMatrixId,
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error saving matrix data", details: error.message });
  }
});

// Endpoint to load available matrices
app.get("/api/get-matrix-list", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const connection = await pool.getConnection();
    const query =
      "SELECT DISTINCT matrix_id FROM matrix_data WHERE user_id = ?";
    const [results] = await connection.query(query, [userId]);
    connection.release(); // Release connection back to the pool

    res.status(200).json(results);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error fetching matrix list", details: error.message });
  }
});

app.get("/api/get-matrix/:matrixId", authenticateToken, async (req, res) => {
  const { matrixId } = req.params;
  const userId = req.user.userId;

  try {
    const connection = await pool.getConnection();
    const query =
      "SELECT column_name, transformation FROM matrix_data WHERE matrix_id = ? AND user_id = ?";
    const [results] = await connection.query(query, [matrixId, userId]);
    connection.release(); // Release connection back to the pool

    res.json(results);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Error fetching matrix data", details: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
