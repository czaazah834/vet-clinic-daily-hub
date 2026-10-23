import express from "express";
import { query, withTransaction } from "../db.js";
import { sha256 } from "../security.js";

export const clinicRouter = express.Router();

/* Helper: log an action to audit_logs */
async function recordAudit(userName, userRole, action) {
  try {
    await query(
      "INSERT INTO audit_logs (user_name, user_role, action) VALUES ($1, $2, $3)",
      [userName || "System", userRole || "system", action]
    );
  } catch (err) {
    console.error("Audit log error:", err.message);
  }
}

/* 1. BOOTSTRAP / FULL STATE SYNC */
clinicRouter.get("/state", async (req, res) => {
  try {
    const [
      ownersRes,
      petsRes,
      weightsRes,
      apptsRes,
      vaccsRes,
      consultsRes,
      requestsRes,
      logsRes,
      vetsRes
    ] = await Promise.all([
      query(`
        SELECT o.*, u.birthday, u.first_name, u.last_name, u.middle_initial, u.role as user_role,
               a.house_street, a.country, a.state, a.city, a.zip_code
        FROM owners o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN addresses a ON a.user_id = o.user_id
        ORDER BY o.name ASC
      `),
      query("SELECT * FROM pets ORDER BY name ASC"),
      query("SELECT * FROM pet_weights ORDER BY date ASC"),
      query("SELECT * FROM appointments ORDER BY date ASC, time ASC"),
      query("SELECT * FROM vaccinations ORDER BY date ASC, id ASC"),
      query("SELECT * FROM consultations ORDER BY date DESC"),
      query("SELECT * FROM pet_requests ORDER BY created_at DESC"),
      query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100"),
      query("SELECT id, first_name, last_name, role FROM users WHERE role = 'vet' ORDER BY first_name ASC")
    ]);

    // Attach weights to pets
    const weightsByPet = {};
    for (const w of weightsRes.rows) {
      if (!weightsByPet[w.pet_id]) weightsByPet[w.pet_id] = [];
      weightsByPet[w.pet_id].push({
        date: w.date ? String(w.date).slice(0, 10) : "",
        kg: parseFloat(w.kg)
      });
    }

    const pets = petsRes.rows.map(p => ({
      id: p.id,
      ownerId: p.owner_id,
      name: p.name,
      species: p.species,
      speciesOther: p.species_other || "",
      breed: p.breed,
      sex: p.sex,
      birth: p.birth ? new Date(p.birth).toISOString().slice(0, 10) : "",
      weight: parseFloat(p.weight),
      color: p.color || "",
      neutered: p.neutered || "Not sure",
      allergies: p.allergies || [],
      vaccinationCardId: p.vaccination_card_id || "",
      notes: p.notes || "",
      photo: p.photo || "",
      weights: weightsByPet[p.id] || [{ date: p.birth ? String(p.birth).slice(0, 10) : "", kg: parseFloat(p.weight) }]
    }));

    const owners = ownersRes.rows.map(o => ({
      id: o.id,
      userId: o.user_id,
      name: o.name,
      firstName: o.first_name || "",
      lastName: o.last_name || "",
      middleInitial: o.middle_initial || "",
      birthday: o.birthday ? String(o.birthday).slice(0, 10) : "",
      email: o.email,
      phone: o.phone,
      houseStreet: o.house_street || "",
      country: o.country || "",
      state: o.state || "",
      city: o.city || "",
      zipCode: o.zip_code || "",
      address: o.address || (o.house_street ? `${o.house_street}, ${o.city}, ${o.state} ${o.zip_code}, ${o.country}` : "")
    }));

    const appts = apptsRes.rows.map(a => ({
      id: a.id,
      petId: a.pet_id,
      vetId: a.vet_id,
      date: a.date ? String(a.date).slice(0, 10) : "",
      time: a.time,
      reason: a.reason,
      status: a.status,
      billingStatus: a.billing_status,
      amount: parseFloat(a.amount),
      intakeVitals: a.intake_vitals || null,
      cancelReason: a.cancel_reason || ""
    }));

    const vaccs = vaccsRes.rows.map(v => ({
      id: v.id,
      petId: v.pet_id,
      cardId: v.card_id,
      vaccine: v.vaccine,
      brand: v.brand || "",
      batch: v.batch || "",
      date: v.date ? String(v.date).slice(0, 10) : "",
      nextDue: v.next_due ? String(v.next_due).slice(0, 10) : null,
      doseNo: v.dose_no,
      doseOf: v.dose_of,
      done: Boolean(v.done),
      automated: Boolean(v.automated),
      protocolType: v.protocol_type || "",
      notes: v.notes || "",
      vetId: v.vet_id || "",
      recordedBy: v.recorded_by || ""
    }));

    const consults = consultsRes.rows.map(c => ({
      id: c.id,
      petId: c.pet_id,
      vetId: c.vet_id,
      apptId: c.appt_id || "",
      date: c.date ? String(c.date).slice(0, 10) : "",
      symptoms: c.symptoms,
      objective: c.objective,
      diagnosis: c.diagnosis,
      treatment: c.treatment,
      prescription: c.prescription || ""
    }));

    const petRequests = requestsRes.rows.map(r => ({
      id: r.id,
      ownerId: r.owner_id,
      name: r.name,
      species: r.species,
      speciesOther: r.species_other || "",
      breed: r.breed || "",
      sex: r.sex,
      birth: r.birth ? String(r.birth).slice(0, 10) : "",
      weight: parseFloat(r.weight),
      color: r.color || "",
      neutered: r.neutered || "",
      notes: r.notes || "",
      status: r.status,
      declineReason: r.decline_reason || "",
      petId: r.pet_id || "",
      cardId: r.card_id || "",
      requestedAt: r.requested_at ? String(r.requested_at).slice(0, 10) : "",
      approvedAt: r.approved_at ? String(r.approved_at).slice(0, 10) : null,
      approvedBy: r.approved_by || ""
    }));

    const log = logsRes.rows.map(l => ({
      id: l.id,
      ts: l.created_at ? new Date(l.created_at).toLocaleString() : "",
      user: { name: l.user_name, role: l.user_role },
      action: l.action
    }));

    res.json({
      success: true,
      data: {
        owners,
        pets,
        appts,
        vaccs,
        consults,
        petRequests,
        log
      }
    });
  } catch (err) {
    console.error("Clinic state fetch error:", err);
    res.status(500).json({ error: "Failed to load clinic state: " + err.message });
  }
});

/* 1.5 OWNER CONTACT & PROFILE UPDATE */
clinicRouter.post("/owner/contact", async (req, res) => {
  try {
    const { email, phone, address, houseStreet, city, state, country, zipCode } = req.body;
    const sid = req.cookies?.sid || (req.headers.authorization && req.headers.authorization.replace("Bearer ", ""));
    let userId = null;
    let ownerId = null;

    if (sid) {
      const s = await query("SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()", [sha256(sid)]);
      if (s.rows.length) userId = s.rows[0].user_id;
    }
    if (userId) {
      const o = await query("SELECT id FROM owners WHERE user_id = $1", [userId]);
      if (o.rows.length) ownerId = o.rows[0].id;
    }
    if (!ownerId && email) {
      const o = await query("SELECT id, user_id FROM owners WHERE LOWER(email) = LOWER($1)", [email]);
      if (o.rows.length) {
        ownerId = o.rows[0].id;
        userId = o.rows[0].user_id;
      }
    }
    if (!ownerId) {
      return res.status(404).json({ error: "Owner record not found." });
    }

    if (email) {
      await query("UPDATE owners SET email = $1 WHERE id = $2", [email, ownerId]);
      if (userId) await query("UPDATE users SET email = $1 WHERE id = $2", [email, userId]);
    }
    if (phone) {
      await query("UPDATE owners SET phone = $1 WHERE id = $2", [phone, ownerId]);
      if (userId) await query("UPDATE users SET mobile_number = $1 WHERE id = $2", [phone, userId]);
    }
    if (address) {
      await query("UPDATE owners SET address = $1 WHERE id = $2", [address, ownerId]);
    }
    if (userId && (houseStreet || city || state || country || zipCode)) {
      await query(
        `UPDATE addresses
         SET house_street = COALESCE($1, house_street),
             city = COALESCE($2, city),
             state = COALESCE($3, state),
             country = COALESCE($4, country),
             zip_code = COALESCE($5, zip_code)
         WHERE user_id = $6`,
        [houseStreet || null, city || null, state || null, country || null, zipCode || null, userId]
      );
    }

    const updated = await query(`
      SELECT o.*, u.birthday, u.first_name, u.last_name, u.middle_initial,
             a.house_street, a.country, a.state, a.city, a.zip_code
      FROM owners o
      LEFT JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.user_id = o.user_id
      WHERE o.id = $1
    `, [ownerId]);

    const row = updated.rows[0];
    res.json({
      status: "ok",
      owner: {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        firstName: row.first_name || "",
        lastName: row.last_name || "",
        middleInitial: row.middle_initial || "",
        birthday: row.birthday ? String(row.birthday).slice(0, 10) : "",
        email: row.email,
        phone: row.phone,
        houseStreet: row.house_street || "",
        country: row.country || "",
        state: row.state || "",
        city: row.city || "",
        zipCode: row.zip_code || "",
        address: row.address || ""
      }
    });
  } catch (err) {
    console.error("Update contact error:", err);
    res.status(500).json({ error: "Failed to update contact details." });
  }
});

/* 2. OWNERS CRUD */
clinicRouter.post("/owners", async (req, res) => {
  const { id, name, email, phone, address, actorName, actorRole } = req.body;

  // RBAC check: Assistants cannot edit existing client accounts
  if (id && actorRole === "assistant") {
    return res.status(403).json({ error: "Vet Assistants cannot edit registered pet owner accounts." });
  }

  const ownerId = id || ("o_" + Math.random().toString(36).slice(2, 8));

  try {
    const result = await query(
      `INSERT INTO owners (id, name, email, phone, address)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         address = EXCLUDED.address
       RETURNING *`,
      [ownerId, name, email, phone, address]
    );

    await recordAudit(actorName, actorRole, `Registered / updated pet owner: ${name}`);
    res.json({ success: true, owner: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 3. PETS CRUD & WEIGHT LOGGING */
clinicRouter.post("/owner/pets", async (req, res) => {
  const {
    ownerId, name, species, speciesOther, breed, sex,
    birth, weight, color, neutered, dentalOcclusion, notes, photo
  } = req.body;

  let effectiveOwnerId = ownerId;
  const token = req.cookies?.pawcare_session || (req.headers.authorization || "").replace("Bearer ", "");
  if (!effectiveOwnerId && token) {
    try {
      const sRes = await query(
        `SELECT u.owner_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
        [token]
      );
      if (sRes.rows.length && sRes.rows[0].owner_id) {
        effectiveOwnerId = sRes.rows[0].owner_id;
      }
    } catch (_) {}
  }

  if (!effectiveOwnerId) {
    try {
      const oRes = await query(`SELECT id FROM owners ORDER BY created_at DESC LIMIT 1`);
      if (oRes.rows.length) effectiveOwnerId = oRes.rows[0].id;
    } catch (_) {}
  }

  const petId = "p_" + Math.random().toString(36).slice(2, 8);
  const cardId = "VACC-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (dStr, days) => {
    const d = new Date(dStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const sp = (species || "Canine").toLowerCase();
  const isDog = sp.includes("dog") || sp.includes("canine");
  const isCat = sp.includes("cat") || sp.includes("feline");
  const isRabbit = sp.includes("rabbit") || sp.includes("lagomorph");
  const isRodent = sp.includes("rodent") || sp.includes("hamster") || sp.includes("guinea");
  const isAvian = sp.includes("bird") || sp.includes("avian");

  try {
    const { pet, vaccs } = await withTransaction(async (client) => {
      // 1. Insert Pet into PostgreSQL Masterlist
      const insPet = await client.query(
        `INSERT INTO pets (id, owner_id, name, species, species_other, breed, sex, birth, weight, color, neutered, vaccination_card_id, notes, photo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          petId,
          effectiveOwnerId,
          name,
          species || "Canine (Dog)",
          speciesOther || "",
          breed || "Mixed Breed",
          sex || "Male",
          birth || today,
          parseFloat(weight) || 5.0,
          color || "",
          neutered || "Not sure",
          cardId,
          notes || "",
          photo || ""
        ]
      );

      // 2. Insert Initial Weight
      await client.query(
        `INSERT INTO pet_weights (pet_id, date, kg, recorded_by) VALUES ($1, $2, $3, $4)`,
        [petId, birth || today, parseFloat(weight) || 5.0, "owner"]
      );

      // 3. Seed Core Vaccination Protocols based on VCMS v2.0
      const seeded = [];
      if (isDog) {
        // DHPP 5-in-1
        const v1 = {
          id: "v_" + Math.random().toString(36).slice(2, 8),
          pet_id: petId,
          card_id: cardId,
          vaccine: "DHPP (5-in-1 Core)",
          brand: "Nobivac DHPP",
          batch: "AUTO-DHPP-01",
          date: today,
          next_due: addDays(today, 21),
          dose_no: 1,
          dose_of: 3,
          done: false,
          automated: true,
          protocol_type: "Core Canine Protocol",
          recorded_by: "System Automation"
        };
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          Object.values(v1)
        );
        seeded.push(v1);

        // Anti-Rabies (Mandatory Core RA 9482)
        const v2 = {
          id: "v_" + Math.random().toString(36).slice(2, 8),
          pet_id: petId,
          card_id: cardId,
          vaccine: "Anti-Rabies (1-Year Core)",
          brand: "Defensor 3",
          batch: "AUTO-RAB-01",
          date: today,
          next_due: addDays(today, 30),
          dose_no: 1,
          dose_of: 1,
          done: false,
          automated: true,
          protocol_type: "Core Rabies Protocol",
          recorded_by: "System Automation"
        };
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          Object.values(v2)
        );
        seeded.push(v2);

        // Broad-Spectrum Deworming
        const v3 = {
          id: "v_" + Math.random().toString(36).slice(2, 8),
          pet_id: petId,
          card_id: cardId,
          vaccine: "Broad-Spectrum Deworming",
          brand: "Canex Multi-Spectrum",
          batch: "AUTO-DEW-01",
          date: today,
          next_due: addDays(today, 14),
          dose_no: 1,
          dose_of: 4,
          done: false,
          automated: true,
          protocol_type: "Parasiticide Protocol",
          recorded_by: "System Automation"
        };
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          Object.values(v3)
        );
        seeded.push(v3);
      } else if (isCat) {
        // FVRCP 4-in-1
        const v1 = {
          id: "v_" + Math.random().toString(36).slice(2, 8),
          pet_id: petId,
          card_id: cardId,
          vaccine: "FVRCP (4-in-1 Core)",
          brand: "Fel-O-Vax 4",
          batch: "AUTO-FVR-01",
          date: today,
          next_due: addDays(today, 28),
          dose_no: 1,
          dose_of: 3,
          done: false,
          automated: true,
          protocol_type: "Core Feline Protocol",
          recorded_by: "System Automation"
        };
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          Object.values(v1)
        );
        seeded.push(v1);

        // Feline Rabies
        const v2 = {
          id: "v_" + Math.random().toString(36).slice(2, 8),
          pet_id: petId,
          card_id: cardId,
          vaccine: "Anti-Rabies (Feline Formulation)",
          brand: "Defensor 3",
          batch: "AUTO-RABF-01",
          date: today,
          next_due: addDays(today, 30),
          dose_no: 1,
          dose_of: 1,
          done: false,
          automated: true,
          protocol_type: "Core Rabies Protocol",
          recorded_by: "System Automation"
        };
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          Object.values(v2)
        );
        seeded.push(v2);
      } else if (isRabbit) {
        const v1 = {
          id: "v_" + Math.random().toString(36).slice(2, 8),
          pet_id: petId,
          card_id: cardId,
          vaccine: "RHDV1 / RHDV2 Core Vaccine",
          brand: "Filavac VHD",
          batch: "AUTO-RHD-01",
          date: today,
          next_due: addDays(today, 30),
          dose_no: 1,
          dose_of: 1,
          done: false,
          automated: true,
          protocol_type: "Core Lagomorph Protocol",
          recorded_by: "System Automation"
        };
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          Object.values(v1)
        );
        seeded.push(v1);
      } else if (isRodent) {
        const v1 = {
          id: "v_" + Math.random().toString(36).slice(2, 8),
          pet_id: petId,
          card_id: cardId,
          vaccine: "Dental & Occlusion Clinical Exam",
          brand: "VCMS Protocol",
          batch: "AUTO-DEN-01",
          date: today,
          next_due: addDays(today, 180),
          dose_no: 1,
          dose_of: 2,
          done: false,
          automated: true,
          protocol_type: "Rodent Dental Protocol",
          recorded_by: "System Automation"
        };
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          Object.values(v1)
        );
        seeded.push(v1);
      } else if (isAvian) {
        const v1 = {
          id: "v_" + Math.random().toString(36).slice(2, 8),
          pet_id: petId,
          card_id: cardId,
          vaccine: "Diagnostic Fecal Float Screening",
          brand: "Microscopic Screen",
          batch: "AUTO-FLT-01",
          date: today,
          next_due: addDays(today, 180),
          dose_no: 1,
          dose_of: 1,
          done: false,
          automated: true,
          protocol_type: "Avian Diagnostic Protocol",
          recorded_by: "System Automation"
        };
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          Object.values(v1)
        );
        seeded.push(v1);
      }

      // 4. Record in pet_requests with Approved status for audit and front desk visibility
      const reqId = "req_" + Math.random().toString(36).slice(2, 8);
      await client.query(
        `INSERT INTO pet_requests (id, owner_id, name, species, species_other, breed, sex, birth, weight, color, neutered, notes, status, approved_at, approved_by, pet_id, card_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Approved', CURRENT_DATE, 'Owner Instant Online Registration', $13, $14)`,
        [reqId, effectiveOwnerId, name, species, speciesOther || "", breed || "", sex, birth || today, parseFloat(weight) || 5.0, color || "", neutered || "", notes || "", petId, cardId]
      );

      return { pet: insPet.rows[0], vaccs: seeded };
    });

    await recordAudit("Owner", "owner", `Registered new patient ${name} (${species}) with digital card ${cardId}`);

    res.json({
      success: true,
      pet: {
        id: pet.id,
        ownerId: pet.owner_id,
        name: pet.name,
        species: pet.species,
        speciesOther: pet.species_other || "",
        breed: pet.breed,
        sex: pet.sex,
        birth: pet.birth ? new Date(pet.birth).toISOString().slice(0, 10) : "",
        weight: parseFloat(pet.weight),
        color: pet.color || "",
        neutered: pet.neutered || "Not sure",
        allergies: pet.allergies || [],
        vaccinationCardId: cardId,
        notes: pet.notes || "",
        photo: pet.photo || "",
        dentalOcclusion: dentalOcclusion || "",
        weights: [{ date: pet.birth ? String(pet.birth).slice(0, 10) : today, kg: parseFloat(pet.weight) }]
      },
      cardId,
      vaccs: vaccs.map(v => ({
        id: v.id,
        petId: v.pet_id,
        cardId: v.card_id,
        vaccine: v.vaccine,
        brand: v.brand,
        batch: v.batch,
        date: v.date,
        nextDue: v.next_due,
        doseNo: v.dose_no,
        doseOf: v.dose_of,
        done: v.done,
        automated: v.automated,
        protocolType: v.protocol_type,
        notes: "",
        recordedBy: v.recorded_by
      }))
    });
  } catch (err) {
    console.error("Owner pet registration error:", err);
    res.status(500).json({ error: err.message });
  }
});

clinicRouter.post("/pets", async (req, res) => {
  const {
    id, ownerId, name, species, speciesOther, breed, sex,
    birth, weight, color, neutered, allergies, notes, photo,
    actorName, actorRole
  } = req.body;
  const petId = id || ("p_" + Math.random().toString(36).slice(2, 8));
  const cardId = "VACC-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);

  try {
    const result = await withTransaction(async (client) => {
      const insPet = await client.query(
        `INSERT INTO pets (id, owner_id, name, species, species_other, breed, sex, birth, weight, color, neutered, allergies, vaccination_card_id, notes, photo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [petId, ownerId, name, species || "Dog", speciesOther || "", breed || "Mixed Breed", sex || "Male", birth, weight || 5.0, color || "", neutered || "Not sure", allergies || [], cardId, notes || "", photo || ""]
      );

      // Record baseline weight
      await client.query(
        `INSERT INTO pet_weights (pet_id, date, kg) VALUES ($1, $2, $3)`,
        [petId, birth || new Date().toISOString().slice(0, 10), weight || 5.0]
      );

      return insPet.rows[0];
    });

    await recordAudit(actorName, actorRole, `Registered patient ${name} (${species}) with card ${cardId}`);
    res.json({ success: true, pet: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

clinicRouter.post("/pets/:id/weights", async (req, res) => {
  const petId = req.params.id;
  const { date, kg, recordedBy } = req.body;
  try {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO pet_weights (pet_id, date, kg, recorded_by) VALUES ($1, $2, $3, $4)`,
        [petId, date || new Date().toISOString().slice(0, 10), kg, recordedBy || "clinic"]
      );
      await client.query(`UPDATE pets SET weight = $1 WHERE id = $2`, [kg, petId]);
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 4. ONLINE PET REGISTRATION REQUESTS & APPROVAL AUTOMATION */
clinicRouter.post("/pet-requests", async (req, res) => {
  const { ownerId, name, species, speciesOther, breed, sex, birth, weight, color, neutered, notes } = req.body;
  const reqId = "req_" + Math.random().toString(36).slice(2, 8);

  try {
    const result = await query(
      `INSERT INTO pet_requests (id, owner_id, name, species, species_other, breed, sex, birth, weight, color, neutered, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [reqId, ownerId, name, species, speciesOther || "", breed || "", sex, birth, weight, color || "", neutered || "", notes || ""]
    );
    await recordAudit("Owner", "owner", `Submitted online pet registration request for ${name}`);
    res.json({ success: true, request: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

clinicRouter.post("/pet-requests/:id/approve", async (req, res) => {
  const reqId = req.params.id;
  const { actorName, actorRole } = req.body;
  const today = new Date().toISOString().slice(0, 10);
  const cardId = "VACC-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000);
  const newPetId = "p_" + Math.random().toString(36).slice(2, 8);

  try {
    const result = await withTransaction(async (client) => {
      const qReq = await client.query("SELECT * FROM pet_requests WHERE id = $1", [reqId]);
      if (!qReq.rows.length) throw new Error("Request not found");
      const r = qReq.rows[0];
      if (r.status === "Approved") throw new Error("Request is already approved");

      // 1. Insert into pets table
      await client.query(
        `INSERT INTO pets (id, owner_id, name, species, species_other, breed, sex, birth, weight, color, neutered, vaccination_card_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [newPetId, r.owner_id, r.name, r.species, r.species_other || "", r.breed || "Mixed Breed", r.sex, r.birth, r.weight, r.color || "", r.neutered || "Not sure", cardId, r.notes || ""]
      );

      // 2. Insert weight baseline
      await client.query(
        `INSERT INTO pet_weights (pet_id, date, kg) VALUES ($1, $2, $3)`,
        [newPetId, today, r.weight]
      );

      // 3. Automated Digital Card Vaccine Protocol Seeds (Core schedules per VCMS v2.0)
      const sp = (r.species || "").toLowerCase();
      const isDog = sp.includes("dog") || sp.includes("canine");
      const isCat = sp.includes("cat") || sp.includes("feline");
      const isRabbit = sp.includes("rabbit") || sp.includes("lagomorph");
      const isRodent = sp.includes("rodent") || sp.includes("hamster") || sp.includes("guinea");
      const isAvian = sp.includes("bird") || sp.includes("avian");
      const addDays = (dStr, days) => {
        const d = new Date(dStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
      };

      if (isDog) {
        // DHPP 1st Shot
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          ["v_" + Math.random().toString(36).slice(2, 8), newPetId, cardId, "DHPP (5-in-1)", "Nobivac", "AUTO-GEN-01", today, addDays(today, 21), 1, 3, false, true, "Core Canine Protocol", "System Automation"]
        );
        // Rabies Booster
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          ["v_" + Math.random().toString(36).slice(2, 8), newPetId, cardId, "Rabies (1-Year)", "Defensor", "AUTO-GEN-02", today, addDays(today, 30), 1, 1, false, true, "Core Rabies Protocol", "System Automation"]
        );
      } else if (isCat) {
        // FVRCP 1st Shot
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          ["v_" + Math.random().toString(36).slice(2, 8), newPetId, cardId, "FVRCP (4-in-1)", "Fel-O-Vax", "AUTO-GEN-03", today, addDays(today, 28), 1, 2, false, true, "Core Feline Protocol", "System Automation"]
        );
        // Rabies
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          ["v_" + Math.random().toString(36).slice(2, 8), newPetId, cardId, "Rabies (Feline)", "Defensor", "AUTO-GEN-04", today, addDays(today, 30), 1, 1, false, true, "Core Rabies Protocol", "System Automation"]
        );
      } else if (isRabbit) {
        // RHDV1 / RHDV2
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          ["v_" + Math.random().toString(36).slice(2, 8), newPetId, cardId, "RHDV1 / RHDV2 Core Vaccine", "Filavac", "AUTO-GEN-05", today, addDays(today, 30), 1, 1, false, true, "Core Lagomorph Protocol", "System Automation"]
        );
      } else if (isRodent) {
        // Rodent Dental / Occlusion Surveillance
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          ["v_" + Math.random().toString(36).slice(2, 8), newPetId, cardId, "Dental & Occlusion Exam", "VCMS Dental Check", "AUTO-GEN-06", today, addDays(today, 180), 1, 2, false, true, "Rodent Dental Protocol", "System Automation"]
        );
      } else if (isAvian) {
        // Avian Fecal Float
        await client.query(
          `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          ["v_" + Math.random().toString(36).slice(2, 8), newPetId, cardId, "Fecal Float Screening", "Microscopic Float", "AUTO-GEN-07", today, addDays(today, 180), 1, 1, false, true, "Avian Diagnostic Protocol", "System Automation"]
        );
      }

      // 4. Update pet_request record
      const upd = await client.query(
        `UPDATE pet_requests
         SET status = 'Approved', approved_at = CURRENT_DATE, approved_by = $1, pet_id = $2, card_id = $3
         WHERE id = $4
         RETURNING *`,
        [actorName || "Vet Assistant", newPetId, cardId, reqId]
      );

      return { petId: newPetId, cardId, request: upd.rows[0] };
    });

    await recordAudit(actorName, actorRole, `Approved pet request for ${result.request.name} (Assigned Card ${cardId})`);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

clinicRouter.post("/pet-requests/:id/decline", async (req, res) => {
  const reqId = req.params.id;
  const { reason, actorName, actorRole } = req.body;
  try {
    const result = await query(
      `UPDATE pet_requests SET status = 'Declined', decline_reason = $1 WHERE id = $2 RETURNING *`,
      [reason || "Incomplete or invalid pet information", reqId]
    );
    await recordAudit(actorName, actorRole, `Declined pet request ${reqId}: ${reason}`);
    res.json({ success: true, request: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 5. APPOINTMENTS & CHECK-IN INTAKE FLOW */
clinicRouter.post("/appointments", async (req, res) => {
  const { petId, vetId, date, time, reason, amount, actorName, actorRole } = req.body;
  const apptId = "a_" + Math.random().toString(36).slice(2, 8);

  try {
    const result = await query(
      `INSERT INTO appointments (id, pet_id, vet_id, date, time, reason, status, amount)
       VALUES ($1, $2, $3, $4, $5, $6, 'Scheduled', $7)
       RETURNING *`,
      [apptId, petId, vetId || "u_vet_1", date, time, reason, amount || 600.00]
    );

    await recordAudit(actorName, actorRole, `Booked appointment for pet ${petId} on ${date} ${time}`);
    res.json({ success: true, appointment: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

clinicRouter.patch("/appointments/:id/status", async (req, res) => {
  const apptId = req.params.id;
  const { status, intakeVitals, cancelReason, billingStatus, actorName, actorRole } = req.body;

  try {
    const result = await withTransaction(async (client) => {
      let q = "UPDATE appointments SET status = $1";
      const params = [status];
      let pIdx = 2;

      if (intakeVitals !== undefined) {
        q += `, intake_vitals = $${pIdx++}`;
        params.push(JSON.stringify(intakeVitals));
      }
      if (cancelReason !== undefined) {
        q += `, cancel_reason = $${pIdx++}`;
        params.push(cancelReason);
      }
      if (billingStatus !== undefined) {
        q += `, billing_status = $${pIdx++}`;
        params.push(billingStatus);
      }

      q += ` WHERE id = $${pIdx} RETURNING *`;
      params.push(apptId);

      const upd = await client.query(q, params);
      if (!upd.rows.length) throw new Error("Appointment not found");

      // If Checked-in and has weight in intake vitals, update pet weight log
      if (status === "Checked-in" && intakeVitals?.weight) {
        const appt = upd.rows[0];
        const numWeight = parseFloat(intakeVitals.weight);
        if (!isNaN(numWeight)) {
          await client.query("UPDATE pets SET weight = $1 WHERE id = $2", [numWeight, appt.pet_id]);
          await client.query(
            "INSERT INTO pet_weights (pet_id, date, kg, recorded_by) VALUES ($1, $2, $3, $4)",
            [appt.pet_id, appt.date, numWeight, actorName || "Front Desk"]
          );
        }
      }

      return upd.rows[0];
    });

    await recordAudit(actorName, actorRole, `Updated appointment ${apptId} status to "${status}"`);
    res.json({ success: true, appointment: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 6. VACCINATIONS & FRONT DESK / ASSISTANT LOGGING */
clinicRouter.post("/vaccinations", async (req, res) => {
  const {
    id, petId, cardId, vaccine, brand, batch, date,
    nextDue, doseNo, doseOf, done, automated, protocolType,
    notes, vetId, recordedBy, actorName, actorRole
  } = req.body;
  const vaccId = id || ("v_" + Math.random().toString(36).slice(2, 8));

  try {
    const result = await query(
      `INSERT INTO vaccinations (id, pet_id, card_id, vaccine, brand, batch, date, next_due, dose_no, dose_of, done, automated, protocol_type, notes, vet_id, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         vaccine = EXCLUDED.vaccine,
         brand = EXCLUDED.brand,
         batch = EXCLUDED.batch,
         date = EXCLUDED.date,
         next_due = EXCLUDED.next_due,
         dose_no = EXCLUDED.dose_no,
         dose_of = EXCLUDED.dose_of,
         done = EXCLUDED.done,
         notes = EXCLUDED.notes,
         recorded_by = EXCLUDED.recorded_by
       RETURNING *`,
      [vaccId, petId, cardId || "VACC-DEFAULT", vaccine, brand || "", batch || "", date, nextDue || null, doseNo || 1, doseOf || 1, done !== undefined ? done : true, Boolean(automated), protocolType || "", notes || "", vetId || "", recordedBy || actorName || "Front Desk Assistant"]
    );

    await recordAudit(actorName, actorRole, `Logged vaccination ${vaccine} (${batch || "No lot#"}) for pet ${petId}`);
    res.json({ success: true, vaccination: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

clinicRouter.delete("/vaccinations/:id", async (req, res) => {
  const { id } = req.params;
  const { actorName, actorRole } = req.body;
  try {
    await query("DELETE FROM vaccinations WHERE id = $1", [id]);
    await recordAudit(actorName, actorRole, `Deleted vaccination record ${id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 7. CONSULTATIONS (SOAP MEDICAL NOTES) */
clinicRouter.post("/consultations", async (req, res) => {
  const { id, petId, vetId, apptId, date, symptoms, objective, diagnosis, treatment, prescription, actorName, actorRole } = req.body;
  const consultId = id || ("c_" + Math.random().toString(36).slice(2, 8));

  try {
    const result = await query(
      `INSERT INTO consultations (id, pet_id, vet_id, appt_id, date, symptoms, objective, diagnosis, treatment, prescription)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [consultId, petId, vetId, apptId || "", date, symptoms, objective, diagnosis, treatment, prescription || ""]
    );

    // If linked to an appointment, mark appointment completed
    if (apptId) {
      await query("UPDATE appointments SET status = 'Completed' WHERE id = $1", [apptId]);
    }

    await recordAudit(actorName, actorRole, `Recorded SOAP consultation notes for pet ${petId} (${diagnosis})`);
    res.json({ success: true, consultation: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 8. AUDIT LOGS RETRIEVAL & MANUAL LOGGING */
clinicRouter.get("/logs", async (req, res) => {
  try {
    const result = await query("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200");
    res.json({ success: true, logs: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

clinicRouter.post("/logs", async (req, res) => {
  const { userName, userRole, action } = req.body;
  try {
    await recordAudit(userName, userRole, action);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

