const express = require("express");
const mysql = require("mysql");
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

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

// Function to generate JWT tokens
const generateToken = (user) => {
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: "1h",
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

// API route to authenticate a user (ALL GOOD)
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

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) return res.sendStatus(401); // If no token is found

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // If token is invalid

    req.user = user; // Attach user object to request
    next(); // Proceed to the next middleware or route handler
  });
};

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

// app.post("/api/save-matrix", (req, res) => {
//   const { userId, matrixId, matrixData } = req.body;

//   if (!userId || !Array.isArray(matrixData) || matrixData.length === 0) {
//     return res.status(400).json({ error: "Invalid input data" });
//   }

//   getConnection((err, connection) => {
//     if (err) {
//       return res.status(500).json({ error: "Database error" });
//     }

//     // Generate new matrixId if not provided
//     const generateNewMatrixId = (callback) => {
//       const query =
//         "SELECT MAX(matrix_id) AS maxMatrixId FROM matrix_data WHERE user_id = ?";
//       connection.query(query, [userId], (err, results) => {
//         if (err) {
//           callback(err, null);
//         } else {
//           const lastMatrixId = results[0].maxMatrixId || 0; // If null, start with 0
//           const newMatrixId = lastMatrixId + 1;
//           callback(null, newMatrixId);
//         }
//       });
//     };

//     const insertMatrixData = (matrixIdToUse) => {
//       const values = matrixData.map((row) => [
//         userId,
//         matrixIdToUse,
//         row.columnName,
//         row.transformation,
//       ]);

//       const query = `
//         INSERT INTO matrix_data (user_id, matrix_id, column_name, transformation)
//         VALUES ?
//       `;

//       connection.query(query, [values], (err, result) => {
//         connection.release();
//         if (err) {
//           return res
//             .status(500)
//             .json({ error: "Database error", details: err.message });
//         }

//         res.status(201).json({
//           message: "Matrix data saved successfully",
//           matrixId: matrixIdToUse,
//         });
//       });
//     };

//     if (matrixId) {
//       insertMatrixData(matrixId);
//     } else {
//       generateNewMatrixId((err, newMatrixId) => {
//         if (err) {
//           connection.release();
//           return res.status(500).json({
//             error: "Error generating new matrixId",
//             details: err.message,
//           });
//         }
//         insertMatrixData(newMatrixId);
//       });
//     }
//   });
// });

// API route to get matrix data
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

// Endpoint to load available matrices
app.get("/api/get-matrix-list", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }

    const userId = decoded.userId;

    getConnection((err, connection) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      const query =
        "SELECT DISTINCT matrix_id FROM matrix_data WHERE user_id = ?";
      connection.query(query, [userId], (err, results) => {
        connection.release();
        if (err) {
          return res
            .status(500)
            .json({ error: "Database error", details: err.message });
        }

        res.status(200).json(results);
      });
    });
  });
});

const mockData = {
  1: [
    // matrix_id: 1
    {
      user_id: 1,
      matrix_id: 1,
      column_name: "Column 1",
      transformation: "Transform 1",
    },
    {
      user_id: 1,
      matrix_id: 1,
      column_name: "Column 2",
      transformation: "Transform 2",
    },
  ],
  2: [
    // matrix_id: 2
    {
      user_id: 1,
      matrix_id: 2,
      column_name: "Column A",
      transformation: "Transform A",
    },
    {
      user_id: 1,
      matrix_id: 2,
      column_name: "Column B",
      transformation: "Transform B",
    },
  ],
};

app.get("/api/get-matrix/:userId/:matrixId", (req, res) => {
  const { userId, matrixId } = req.params;

  // Simulate fetching data based on matrixId
  const data = mockData[matrixId] || [];
  res.json(data);
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
