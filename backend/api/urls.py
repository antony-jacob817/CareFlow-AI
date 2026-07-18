from django.urls import path
from . import views

urlpatterns = [
    path('predict/', views.predict_risk, name='predict_risk'),
    path('patients/', views.get_patients, name='get_patients'),
]