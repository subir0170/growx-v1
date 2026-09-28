import json
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .ai import generate_ai_response
from .models import (
    AIProfile,
    PostQueue,
    ResponseHistory,
    TelegramSource,
    UserProfile,
    XAccount,
)


def health_check(request):
    return JsonResponse(
        {"status": "ok", "message": "X AI Engagement Assistant API is running!"}
    )


@csrf_exempt
def api_register(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            full_name = data.get("full_name")
            email = data.get("email")
            password = data.get("password")
            confirm_password = data.get("confirm_password")

            if not all([full_name, email, password, confirm_password]):
                return JsonResponse({"error": "All fields are required."}, status=400)

            if password != confirm_password:
                return JsonResponse({"error": "Passwords do not match."}, status=400)

            if User.objects.filter(username=email).exists():
                return JsonResponse({"error": "Email already registered."}, status=400)

            user = User.objects.create_user(
                username=email, email=email, password=password
            )
            user.first_name = full_name
            user.save()

            UserProfile.objects.create(user=user, full_name=full_name, email=email)
            AIProfile.objects.create(user=user, role="Professional", tone="Friendly")

            return JsonResponse(
                {"success": True, "message": "Registered successfully."}
            )
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request method."}, status=405)


@csrf_exempt
def api_login(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            email = data.get("email")
            password = data.get("password")

            if not email or not password:
                return JsonResponse(
                    {"error": "Email and password are required."}, status=400
                )

            try:
                user_obj = User.objects.get(email=email)
                username = user_obj.username
            except User.DoesNotExist:
                return JsonResponse({"error": "Invalid email or password."}, status=400)

            user = authenticate(request, username=username, password=password)
            if user is not None:
                login(request, user)
                return JsonResponse(
                    {"success": True, "message": "Logged in successfully."}
                )
            else:
                return JsonResponse({"error": "Invalid email or password."}, status=400)
        except Exception as e:
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request method."}, status=405)


@csrf_exempt
def api_logout(request):
    if request.method == "POST":
        logout(request)
        return JsonResponse({"success": True, "message": "Logged out successfully."})
    return JsonResponse({"error": "Invalid request method."}, status=405)


def api_me(request):
    if request.user.is_authenticated:
        return JsonResponse({
            "is_authenticated": True,
            "email": request.user.email,
            "full_name": request.user.first_name,
        })
    return JsonResponse({"is_authenticated": False}, status=401)


def api_dashboard(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    user = request.user
    total_posts = PostQueue.objects.filter(user=user).count()
    total_responses = ResponseHistory.objects.filter(user=user).count()
    completed = PostQueue.objects.filter(user=user, status="COMPLETED").count()
    pending = PostQueue.objects.filter(
        user=user, status__in=["NEW", "AI_GENERATED"]
    ).count()
    recent_activity = list(
        ResponseHistory.objects.filter(user=user)
        .order_by("-created_at")[:5]
        .values("x_username", "status", "created_at")
    )
    return JsonResponse({
        "full_name": user.first_name,
        "total_posts": total_posts,
        "total_responses": total_responses,
        "completed": completed,
        "pending": pending,
        "recent_activity": recent_activity,
    })


@csrf_exempt
def api_account_x(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    if request.method == "POST":
        data = json.loads(request.body)
        username = data.get("username")
        XAccount.objects.update_or_create(
            user=request.user, defaults={"username": username, "status": "Connected"}
        )
        return JsonResponse({"success": True})

    account = XAccount.objects.filter(user=request.user).first()
    return JsonResponse({
        "username": account.username if account else "",
        "status": account.status if account else "Disconnected",
    })


@csrf_exempt
def api_account_telegram(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    if request.method == "POST":
        data = json.loads(request.body)
        username = data.get("username")
        TelegramSource.objects.update_or_create(
            user=request.user, defaults={"username": username, "status": "Connected"}
        )
        return JsonResponse({"success": True})

    source = TelegramSource.objects.filter(user=request.user).first()
    return JsonResponse({
        "username": source.username if source else "",
        "status": source.status if source else "Disconnected",
    })


@csrf_exempt
def api_queue(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    if request.method == "POST":
        data = json.loads(request.body)
        x_url = data.get("x_url")
        post_text = data.get("post_text")

        if not x_url or not post_text:
            return JsonResponse(
                {"success": False, "error": "URL and Post text are required."},
                status=400,
            )

        # Duplicate Check (Same user + x_url)
        if PostQueue.objects.filter(user=request.user, x_url=x_url).exists():
            return JsonResponse(
                {
                    "success": False,
                    "error": "This post already exists in your queue.",
                },
                status=400,
            )

        try:
            PostQueue.objects.create(
                user=request.user,
                x_username=data.get("x_username") or "Unknown",
                x_url=x_url,
                post_text=post_text,
                status="NEW",
            )
            return JsonResponse({"success": True})
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)}, status=400)

    items = list(
        PostQueue.objects.filter(user=request.user)
        .exclude(status="COMPLETED")
        .values("id", "x_username", "x_url", "post_text", "status", "ai_response")
    )
    return JsonResponse({"queue": items})


@csrf_exempt
def api_queue_pending(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    
    pending_item = PostQueue.objects.filter(user=request.user, status__in=["NEW", "AI_GENERATED"]).first()
    
    if pending_item:
        if pending_item.status == "NEW":
            try:
                ai_profile, _ = AIProfile.objects.get_or_create(user=request.user)
                ai_text = generate_ai_response(
                    post_text=pending_item.post_text,
                    username=pending_item.x_username,
                    role=ai_profile.role,
                    tone=ai_profile.tone,
                    custom_prompt=ai_profile.custom_prompt,
                )
                pending_item.ai_response = ai_text
                pending_item.status = "AI_GENERATED"
                pending_item.save()
            except Exception as e:
                pending_item.status = "FAILED"
                pending_item.save()
                return JsonResponse({"next_item": None, "error": str(e)}, status=500)
        
        item_data = {
            "id": pending_item.id,
            "x_username": pending_item.x_username,
            "x_url": pending_item.x_url,
            "ai_response": pending_item.ai_response or "Great post!"
        }
        return JsonResponse({"next_item": item_data})
    
    return JsonResponse({"next_item": None})


@csrf_exempt
def api_queue_action(request, item_id, action):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    try:
        item = PostQueue.objects.get(id=item_id, user=request.user)
        ai_profile, _ = AIProfile.objects.get_or_create(user=request.user)

        if action == "generate":
            try:
                ai_text = generate_ai_response(
                    post_text=item.post_text,
                    username=item.x_username,
                    role=ai_profile.role,
                    tone=ai_profile.tone,
                    custom_prompt=ai_profile.custom_prompt,
                )
                item.ai_response = ai_text
                item.status = "AI_GENERATED"
                item.save()
                return JsonResponse({"success": True, "ai_response": ai_text})
            except Exception as e:
                item.status = "FAILED"
                item.save()
                return JsonResponse(
                    {"success": False, "error": f"Gemini error: {str(e)}"}, status=500
                )

        elif action == "complete":
            item.status = "COMPLETED"
            item.save()
            ResponseHistory.objects.create(
                user=request.user,
                queue_item=item,
                x_url=item.x_url,
                x_username=item.x_username,
                ai_response=item.ai_response or "",
                status="COMPLETED",
            )
            return JsonResponse({"success": True})

        elif action == "skip":
            item.status = "SKIPPED"
            item.save()
            return JsonResponse({"success": True})

        return JsonResponse(
            {"success": False, "error": "Invalid action"}, status=400
        )
    except PostQueue.DoesNotExist:
        return JsonResponse({"success": False, "error": "Item not found"}, status=404)


def api_history(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)
    history = list(
        ResponseHistory.objects.filter(user=request.user).values(
            "x_username", "x_url", "ai_response", "status", "created_at"
        )
    )
    return JsonResponse({"history": history})


@csrf_exempt
def api_settings(request):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Unauthorized"}, status=401)

    user = request.user
    ai_profile, _ = AIProfile.objects.get_or_create(user=user)

    if request.method == "POST":
        data = json.loads(request.body)
        user.first_name = data.get("name", user.first_name)
        user.save()
        ai_profile.role = data.get("role", ai_profile.role)
        ai_profile.tone = data.get("tone", ai_profile.tone)
        ai_profile.custom_prompt = data.get(
            "custom_prompt", ai_profile.custom_prompt
        )
        ai_profile.save()
        return JsonResponse({"success": True})

    return JsonResponse({
        "name": user.first_name,
        "email": user.email,
        "role": ai_profile.role,
        "tone": ai_profile.tone,
        "custom_prompt": ai_profile.custom_prompt,
    })