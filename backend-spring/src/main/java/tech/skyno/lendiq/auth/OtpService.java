package tech.skyno.lendiq.auth;

import com.mongodb.client.result.DeleteResult;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

/**
 * OTP lifecycle: generate, store with TTL, and verify.
 *
 * <p>We lean on the existing {@code otps} collection so this skeleton is
 * compatible with the FastAPI backend's seed data. Each record:</p>
 * <pre>{ mobile, otp, scope:"auth", purpose, created_at, expires_at }</pre>
 *
 * <p>The service also lazily upserts a {@code users} document on the first
 * successful verification so downstream controllers can look the user up by
 * {@code mobile}/{@code user_id}.</p>
 */
@Service
public class OtpService {

    private final MongoTemplate mongo;
    private final JwtService jwt;
    private final int expiryMinutes;
    private final int sendCooldownSeconds;
    private final boolean demoMode;

    public OtpService(MongoTemplate mongo,
                      JwtService jwt,
                      @Value("${app.otp.expiry-minutes}") int expiryMinutes,
                      @Value("${app.otp.send-cooldown-seconds}") int sendCooldownSeconds,
                      @Value("${app.otp.demo-mode}") boolean demoMode) {
        this.mongo = mongo;
        this.jwt = jwt;
        this.expiryMinutes = expiryMinutes;
        this.sendCooldownSeconds = sendCooldownSeconds;
        this.demoMode = demoMode;
    }

    /** Generate + persist an OTP for the given mobile. Returns the code in demo mode. */
    public Map<String, Object> sendOtp(String mobile, String purpose, String name) {
        mobile = normalizeMobile(mobile);
        if (mobile.length() != 10) throw new IllegalArgumentException("Mobile must be 10 digits");

        // Cooldown: enforce a minimum delta between successive sends for the
        // same mobile. Helps choke off brute-force / spam of free SMS sends.
        Document existing = mongo.findOne(
                Query.query(Criteria.where("mobile").is(mobile).and("scope").is("auth")),
                Document.class, "otps");
        if (existing != null) {
            Instant created = existing.get("created_at", Instant.class);
            if (created != null && Instant.now().isBefore(created.plusSeconds(sendCooldownSeconds))) {
                long retry = sendCooldownSeconds - (Instant.now().getEpochSecond() - created.getEpochSecond());
                throw new IllegalStateException("Please wait " + retry + "s before requesting another OTP.");
            }
        }

        String otp = String.format("%06d", ThreadLocalRandom.current().nextInt(0, 1_000_000));
        Instant now = Instant.now();
        Instant expires = now.plusSeconds(expiryMinutes * 60L);

        Document record = new Document()
                .append("mobile", mobile)
                .append("otp", otp)
                .append("scope", "auth")
                .append("purpose", purpose)
                .append("name", name)
                .append("created_at", now)
                .append("expires_at", expires);
        mongo.getCollection("otps").replaceOne(
                new Document("mobile", mobile).append("scope", "auth"),
                record,
                new com.mongodb.client.model.ReplaceOptions().upsert(true));

        Map<String, Object> out = new HashMap<>();
        out.put("ok", true);
        out.put("mobile", mobile);
        out.put("message", "OTP sent (mock). Valid " + expiryMinutes + " minutes.");
        if (demoMode) out.put("demo_otp", otp);
        return out;
    }

    /** Consume the latest OTP for the mobile; issue a JWT + ensure a users row exists. */
    public Map<String, Object> verifyOtp(String mobile, String otp) {
        mobile = normalizeMobile(mobile);
        Document rec = mongo.findOne(
                Query.query(Criteria.where("mobile").is(mobile).and("scope").is("auth")),
                Document.class, "otps");
        if (rec == null) throw new IllegalStateException("OTP not found. Please request a new one.");
        Instant exp = rec.get("expires_at", Instant.class);
        if (exp != null && Instant.now().isAfter(exp)) throw new IllegalStateException("OTP expired.");
        if (!otp.equals(rec.getString("otp"))) throw new IllegalStateException("Invalid OTP.");

        // Upsert the user record (if the FastAPI backend hasn't created one yet).
        Document user = mongo.findOne(
                Query.query(Criteria.where("mobile").is(mobile)),
                Document.class, "users");
        if (user == null) {
            String uid = "user_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
            String name = rec.getString("name");
            if (name == null || name.isBlank()) name = "User " + mobile.substring(6);
            user = new Document()
                    .append("user_id", uid)
                    .append("mobile", mobile)
                    .append("name", name)
                    .append("role", "lender")
                    .append("mobile_verified", true)
                    .append("created_at", Instant.now());
            mongo.getCollection("users").insertOne(user);
        } else {
            mongo.updateFirst(
                    Query.query(Criteria.where("mobile").is(mobile)),
                    new Update().set("mobile_verified", true),
                    "users");
        }

        // Burn the OTP so it can't be reused.
        DeleteResult deleted = mongo.getCollection("otps").deleteOne(
                new Document("mobile", mobile).append("scope", "auth"));
        assert deleted.wasAcknowledged();

        String token = jwt.issue(user.getString("user_id"));
        Map<String, Object> out = new HashMap<>();
        out.put("access_token", token);
        // Strip internal/secret fields before echoing the user back.
        Document publicUser = new Document(user);
        publicUser.remove("_id");
        publicUser.remove("password_hash");
        publicUser.remove("passcode_hash");
        publicUser.remove("mobile_verified");
        out.put("user", publicUser);
        out.put("has_passcode", false); // Deprecated, always false.
        return out;
    }

    private String normalizeMobile(String raw) {
        if (raw == null) return "";
        String digits = raw.replaceAll("[^0-9]", "");
        if (digits.length() > 10) digits = digits.substring(digits.length() - 10);
        return digits;
    }
}
