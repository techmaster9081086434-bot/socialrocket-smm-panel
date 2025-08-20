const { db, admin } = require("../config/firebase");

// For Users
exports.createTicket = async (req, res) => {
  const { subject, message } = req.body;
  const { uid, email } = req.user;

  if (!subject || !message) {
    return res.status(400).json({ error: "Subject and message are required." });
  }
  try {
    await db.collection("support_tickets").add({
      userId: uid,
      userEmail: email,
      subject,
      message,
      status: "Pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ message: "Support ticket created successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to create support ticket." });
  }
};

exports.getUserTickets = async (req, res) => {
  try {
    const snapshot = await db
      .collection("support_tickets")
      .where("userId", "==", req.user.uid)
      .orderBy("createdAt", "desc")
      .get();
    const tickets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tickets." });
  }
};

// For Admins
exports.getAllTickets = async (req, res) => {
  try {
    const snapshot = await db
      .collection("support_tickets")
      .orderBy("createdAt", "desc")
      .get();
    const tickets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tickets for admin." });
  }
};

exports.updateTicketStatus = async (req, res) => {
  const { ticketId, status } = req.body;
  if (!ticketId || !status) {
    return res.status(400).json({ error: "Ticket ID and status are required." });
  }
  try {
    await db.collection("support_tickets").doc(ticketId).update({ status });
    res.json({ message: "Ticket status updated successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to update ticket status." });
  }
};