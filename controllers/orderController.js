const { db, admin } = require("../config/firebase");
const { smmRequest } = require("../utils/smm");
const {
  getServicePlatform,
  getServiceSubCategory,
  applyMarkup,
} = require("../utils/pricing");

exports.getServices = async (req, res) => {
  try {
    const [smmServices, markupSnapshot] = await Promise.all([
      smmRequest("services"),
      db.collection("markup_settings").get(),
    ]);
    if (smmServices.error) throw new Error(smmServices.error);

    const markupSettings = {};
    markupSnapshot.forEach((doc) => {
      markupSettings[doc.id] = doc.data();
    });

    const markedUpServices = smmServices.map((service) => {
      if (!service.category || !service.name) return service;
      const platformName = getServicePlatform(service.category);
      const subCategoryName = getServiceSubCategory(service.name);
      const categoryKey = platformName ? `${platformName}_${subCategoryName}` : null;
      const rule = categoryKey ? markupSettings[categoryKey] : undefined;
      const userPrice = applyMarkup(service.rate, rule);
      return { ...service, rate: userPrice.toFixed(4) };
    });
    res.json(markedUpServices);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch and process services." });
  }
};

exports.createOrder = async (req, res) => {
  const { serviceId, link, quantity } = req.body;
  const userRef = db.collection("users").doc(req.user.uid);
  const adminBalanceRef = db.collection("admin_panel").doc("main_balance");

  try {
    const [smmServices, markupSnapshot] = await Promise.all([
      smmRequest("services"),
      db.collection("markup_settings").get(),
    ]);
    if (smmServices.error) throw new Error(smmServices.error);

    const markupSettings = {};
    markupSnapshot.forEach((doc) => (markupSettings[doc.id] = doc.data()));

    const originalService = smmServices.find((s) => String(s.service) === String(serviceId));
    if (!originalService) {
      throw new Error("Service ID not found with provider.");
    }

    const platformName = getServicePlatform(originalService.category);
    const subCategoryName = getServiceSubCategory(originalService.name);
    const categoryKey = platformName ? `${platformName}_${subCategoryName}` : null;
    const rule = markupSettings[categoryKey];

    const userPricePer1k = applyMarkup(originalService.rate, rule);
    const totalCharge = (userPricePer1k / 1000) * quantity;
    const actualCost = (parseFloat(originalService.rate) / 1000) * quantity;
    const profit = totalCharge - actualCost;

    const smmResult = await smmRequest("add", {
      service: serviceId,
      link,
      quantity,
    });

    if (smmResult.error || !smmResult.order) {
      throw new Error(`Provider error: ${smmResult.error || "Failed to get order ID."}`);
    }

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error("User not found.");
      
      const currentBalance = userDoc.data().balance;
      if (currentBalance < totalCharge) {
        throw new Error("Insufficient balance.");
      }

      const newBalance = currentBalance - totalCharge;
      transaction.update(userRef, { balance: newBalance });

      const orderRef = db.collection("orders").doc();
      transaction.set(orderRef, {
        userId: req.user.uid,
        providerOrderId: smmResult.order,
        serviceId,
        serviceName: originalService.name,
        link,
        quantity,
        charge: totalCharge,
        status: "Pending",
        start_count: "N/A",
        remains: "N/A",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      const profitLedgerRef = db.collection("profit_ledger").doc();
      transaction.set(profitLedgerRef, {
        userId: req.user.uid,
        username: userDoc.data().username,
        serviceId,
        serviceName: originalService.name,
        profit,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.set(adminBalanceRef, { 
        secondary_balance: admin.firestore.FieldValue.increment(profit) 
      }, { merge: true });
    });

    res.json({
      order: smmResult.order,
      message: "Order placed successfully!",
    });
  } catch (error) {
    console.error("Order Creation Error:", error);
    res.status(400).json({ error: error.message });
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    const ordersQuery = await db
      .collection("orders")
      .where("userId", "==", req.user.uid)
      .orderBy("timestamp", "desc")
      .get();
    const orders = ordersQuery.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch order history." });
  }
};

exports.updateOrderStatus = async (req, res) => {
    const { ordersToUpdate } = req.body; // Expecting [{ firestoreId, providerOrderId }]
    if (!Array.isArray(ordersToUpdate) || ordersToUpdate.length === 0) {
        return res.status(400).json({ error: "Invalid request format." });
    }

    const providerOrderIds = ordersToUpdate.map(o => o.providerOrderId).join(',');

    try {
        const statusResult = await smmRequest("status", { orders: providerOrderIds });
        if (statusResult.error) throw new Error(statusResult.error);

        const batch = db.batch();
        const updatedOrders = [];

        for (const order of ordersToUpdate) {
            const statusData = statusResult[order.providerOrderId];
            if (statusData) {
                const orderRef = db.collection("orders").doc(order.firestoreId);
                const updateData = {
                    status: statusData.status,
                    remains: statusData.remains,
                    start_count: statusData.start_count,
                };
                batch.update(orderRef, updateData);
                updatedOrders.push({ id: order.firestoreId, ...updateData });
            }
        }
        await batch.commit();
        res.json(updatedOrders);
    } catch (error) {
        res.status(500).json({ error: `Failed to update statuses: ${error.message}` });
    }
};

exports.cancelOrder = async (req, res) => {
  const { providerOrderId } = req.body;
  const result = await smmRequest("cancel", { orders: providerOrderId });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: "Cancel request sent successfully." });
};

exports.refillOrder = async (req, res) => {
  const { providerOrderId, firestoreId } = req.body;
  const result = await smmRequest("refill", { order: providerOrderId });
  if (result.error) return res.status(400).json({ error: result.error });
  
  const orderRef = db.collection("orders").doc(firestoreId);
  await orderRef.update({ refillId: result.refill });
  res.json({ refillId: result.refill });
};

exports.refillStatus = async (req, res) => {
  const { refillId } = req.body;
  const result = await smmRequest("refill_status", { refill: refillId });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
};