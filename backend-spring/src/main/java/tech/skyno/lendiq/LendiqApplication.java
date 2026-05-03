package tech.skyno.lendiq;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * LendIQ Spring Boot skeleton entry-point.
 *
 * <p>This is a <b>starting scaffold</b>, not a drop-in replacement for the FastAPI
 * backend. It exposes OTP-based auth (send-otp / verify-otp), a sample /clients
 * list and a sample /loans list that both read from the SAME MongoDB the Python
 * backend writes to (so feature-parity can be grown incrementally).</p>
 *
 * <p>Ports: 8080 (Spring) vs 8001 (FastAPI). Run both side-by-side while you
 * migrate endpoint-by-endpoint. The Next.js web app's `LENDIQ_API_ORIGIN` env
 * var controls which origin it speaks to.</p>
 */
@SpringBootApplication
public class LendiqApplication {
    public static void main(String[] args) {
        SpringApplication.run(LendiqApplication.class, args);
    }
}
