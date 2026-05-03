package tech.skyno.lendiq.auth;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * Thin JWT helper — HS256-signed, subject = user_id, TTL from config.
 * Intentionally MATCHES the FastAPI implementation shape so the same tokens
 * could (eventually) be accepted on both servers with a shared secret.
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final long expirySeconds;

    public JwtService(@Value("${app.jwt.secret}") String secret,
                      @Value("${app.jwt.expiry-seconds}") long expirySeconds) {
        // Using HMAC SHA-256 — secret must be ≥ 32 bytes. Pad short secrets so dev
        // convenience doesn't trip the signer.
        byte[] raw = secret.getBytes(StandardCharsets.UTF_8);
        if (raw.length < 32) {
            byte[] padded = new byte[32];
            System.arraycopy(raw, 0, padded, 0, raw.length);
            for (int i = raw.length; i < 32; i++) padded[i] = '.';
            raw = padded;
        }
        this.key = Keys.hmacShaKeyFor(raw);
        this.expirySeconds = expirySeconds;
    }

    public String issue(String userId) {
        Date now = new Date();
        Date exp = new Date(now.getTime() + expirySeconds * 1000L);
        return Jwts.builder()
                .subject(userId)
                .issuedAt(now)
                .expiration(exp)
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    public String extractSubject(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload().getSubject();
    }
}
